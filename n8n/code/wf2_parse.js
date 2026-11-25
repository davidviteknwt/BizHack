// Combine the deterministic document checklist with the LLM summary
const d = $('Build summary prompts').first().json;
const findText = (x) => {
  if (x == null) return null;
  if (Array.isArray(x)) { for (const v of x) { const t = findText(v); if (t != null) return t; } return null; }
  if (typeof x === 'object') {
    if (x.text != null) return x.text;
    for (const k of ['output', 'content', 'message', 'choices']) { if (x[k] != null) { const t = findText(x[k]); if (t != null) return t; } }
  }
  return null;
};
const raw = findText($input.first().json);
let out;
if (raw && typeof raw === 'object') out = raw;
else {
  const s = String(raw ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { out = JSON.parse(s); } catch (e) { throw new Error('The model did not return valid JSON: ' + s.slice(0, 400)); }
}
const totals = {
  projects: d.projects.length,
  contracts_missing: d.projects.filter((p) => !p.checklist.contract_signed).length,
  approvals_present: d.projects.filter((p) => p.checklist.building_office_approval).length,
  new_projects: d.projects.filter((p) => p.is_new_project).length,
  open_issues: d.projects.reduce((n, p) => n + p.open_issues.length, 0),
};
return [{
  json: {
    week: d.week,
    generated_at: new Date().toISOString(),
    totals,
    headline: out.headline ?? '',
    attention: out.attention ?? [],
    highlights: out.highlights ?? [],
    summary_markdown: out.summary_markdown ?? '',
    checklist: d.projects,
    processing_seconds: Math.round((Date.now() - d.started_ms) / 100) / 10,
  },
}];
