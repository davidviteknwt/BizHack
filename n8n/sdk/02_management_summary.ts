import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const summaryWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.2,
  config: { name: 'Management summary webhook', parameters: { httpMethod: 'POST', path: 'management-summary', responseMode: 'responseNode', options: {} } },
  output: [{ body: { week: '2026-W47', language: 'en', projects: [{ name: '03_PV_family_house_battery', company: 'ENERGO NWT', documents: ['contract_draft_NOT_SIGNED.pdf'], entries: [{ week: '2026-W47', issues: [] }] }] } }]
});

const documentChecklist = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Document checklist', parameters: { jsCode: "// Document checklist per project, from the file names found in the project folder\nconst raw = $input.first().json;\nconst b = raw.body ?? raw;\n\nconst SIGNED = /(contract[_ -]?signed|signed[_ -]?contract|smlouva.*podepsan)/i;\nconst NOT_SIGNED = /(not[_ -]?signed|nepodepsan|draft|navrh|návrh)/i;\nconst APPROVAL = /(building[_ -]?office[_ -]?approval|occupancy|souhlas|kolaudac)/i;\n\nconst projects = (b.projects || []).map(p => {\n  const docs = (p.documents || []).map(x => (typeof x === 'string' ? x : x.name || ''));\n  const contractSigned = docs.some(n => SIGNED.test(n) && !NOT_SIGNED.test(n));\n  const contractDraft = docs.some(n => NOT_SIGNED.test(n));\n  const approval = docs.some(n => APPROVAL.test(n));\n  const entries = (p.entries || []).slice().sort((a, c) => String(a.week).localeCompare(String(c.week)));\n  const latest = entries[entries.length - 1] || null;\n\n  const flags = [];\n  if (!contractSigned) flags.push({ severity: 'blocker', text: contractDraft ? 'Contract not signed yet (draft only)' : 'No contract in the project folder' });\n  if (!approval) flags.push({ severity: 'info', text: 'No building office approval in the folder yet' });\n  if (entries.length === 0) flags.push({ severity: 'warning', text: 'No weekly report yet' });\n\n  return {\n    id: p.id ?? null,\n    name: p.name,\n    company: p.company || '',\n    weeks_reported: entries.length,\n    latest_week: latest?.week ?? null,\n    is_new_project: entries.length <= 1,\n    documents: docs,\n    checklist: {\n      contract_signed: contractSigned,\n      contract_draft_only: !contractSigned && contractDraft,\n      building_office_approval: approval,\n    },\n    flags,\n    open_issues: (latest?.issues || []).filter(i => (i.severity || 'info') !== 'info'),\n    latest_summary: latest?.project_page_entry?.body ?? latest?.summary ?? '',\n  };\n});\n\nreturn [{\n  json: {\n    started_ms: Date.now(),\n    week: b.week || '',\n    model: b.model || 'gpt-4o-mini',\n    language: b.language || 'en',\n    projects,\n  },\n}];\n" } },
  output: [{ week: '2026-W47', language: 'en', started_ms: 0, projects: [{ name: '03', checklist: { contract_signed: false, contract_draft_only: true, building_office_approval: false }, flags: [], open_issues: [] }] }]
});

const buildSummaryPrompts = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Build summary prompts', parameters: { jsCode: "// Prompts for the one-page management summary, based only on the checklist data\nconst d = $input.first().json;\nconst system_prompt = `You write the weekly management summary for the CEO and the head of construction of a Czech construction company (solar, battery storage, buildings).\nUse ONLY the data given. Never invent numbers or facts. Language: \"${d.language}\".\nReturn ONLY a JSON object:\n{\n  \"headline\": string,\n  \"attention\": [{\"project\": string, \"text\": string}],\n  \"highlights\": [{\"project\": string, \"text\": string}],\n  \"summary_markdown\": string\n}\n- headline: one sentence on how the portfolio is doing this week.\n- attention: what management must act on, blockers first (unsigned contracts, delays, waiting for the client).\n- highlights: progress worth sharing, good candidates for marketing.\n- summary_markdown: the full one-page summary in Markdown: headline, a table (Project | Latest week | Progress | Contract | Approval | Flags), then Attention and Highlights.`;\nconst user_prompt = `Week: ${d.week}\\n\\nPROJECTS (JSON):\\n${JSON.stringify(d.projects, null, 1)}`;\nreturn [{ json: { ...d, system_prompt, user_prompt } }];\n" } },
  output: [{ system_prompt: 'You write...', user_prompt: 'Week: 2026-W47' }]
});

const writeSummary = node({
  type: '@n8n/n8n-nodes-langchain.openAi', version: 2.3,
  config: {
    name: 'Write summary (OpenAI)',
    parameters: {
      resource: 'text', operation: 'response',
      modelId: { __rl: true, mode: 'id', value: 'gpt-4o-mini' },
      responses: { values: [{ type: 'text', role: 'user', content: expr('{{ $json.user_prompt }}') }] },
      simplify: true,
      options: {
        instructions: expr('{{ $json.system_prompt }}'),
        textFormat: { textOptions: { type: 'json_object' } },
        temperature: 0.2,
        maxTokens: 3000
      }
    },
    credentials: { openAiApi: newCredential('OpenAI') }
  },
  output: [{ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"headline":"h","summary_markdown":"# x"}' }] }] }]
});

const combineSummary = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Combine summary + checklist', parameters: { jsCode: "// Combine the deterministic document checklist with the LLM summary\nconst d = $('Build summary prompts').first().json;\nconst findText = (x) => {\n  if (x == null) return null;\n  if (Array.isArray(x)) { for (const v of x) { const t = findText(v); if (t != null) return t; } return null; }\n  if (typeof x === 'object') {\n    if (x.text != null) return x.text;\n    for (const k of ['output', 'content', 'message', 'choices']) { if (x[k] != null) { const t = findText(x[k]); if (t != null) return t; } }\n  }\n  return null;\n};\nconst raw = findText($input.first().json);\nlet out;\nif (raw && typeof raw === 'object') out = raw;\nelse {\n  const s = String(raw ?? '').replace(/^\\s*```(?:json)?\\s*/i, '').replace(/\\s*```\\s*$/, '');\n  try { out = JSON.parse(s); } catch (e) { throw new Error('The model did not return valid JSON: ' + s.slice(0, 400)); }\n}\nconst totals = {\n  projects: d.projects.length,\n  contracts_missing: d.projects.filter((p) => !p.checklist.contract_signed).length,\n  approvals_present: d.projects.filter((p) => p.checklist.building_office_approval).length,\n  new_projects: d.projects.filter((p) => p.is_new_project).length,\n  open_issues: d.projects.reduce((n, p) => n + p.open_issues.length, 0),\n};\nreturn [{\n  json: {\n    week: d.week,\n    generated_at: new Date().toISOString(),\n    totals,\n    headline: out.headline ?? '',\n    attention: out.attention ?? [],\n    highlights: out.highlights ?? [],\n    summary_markdown: out.summary_markdown ?? '',\n    checklist: d.projects,\n    processing_seconds: Math.round((Date.now() - d.started_ms) / 100) / 10,\n  },\n}];\n" } },
  output: [{ week: '2026-W47', headline: 'h', totals: { projects: 1, contracts_missing: 1 }, summary_markdown: '# x' }]
});

const respondSummary = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond to app', parameters: { respondWith: 'firstIncomingItem', options: {} } }
});

const note = sticky('## Weekly management summary\n**POST /webhook/management-summary** with week and projects[] (name, company, documents = file names in the project folder, entries = outputs of the site-report workflow).\n\nReturns totals, the document checklist per project (signed contract? building office approval? new project?), attention list, highlights and a one-page Markdown summary for the CEO and head of construction.', [], { color: 7, width: 560, height: 260 });

export default workflow('bizhack-management-summary', 'BizHack 02 – Weekly management summary + document checklist', { settings: { executionOrder: 'v1', executionTimeout: 300 } })
  .add(note)
  .add(summaryWebhook)
  .to(documentChecklist)
  .to(buildSummaryPrompts)
  .to(writeSummary)
  .to(combineSummary)
  .to(respondSummary);
