// Document checklist per project, from the file names found in the project folder
const raw = $input.first().json;
const b = raw.body ?? raw;

const SIGNED = /(contract[_ -]?signed|signed[_ -]?contract|smlouva.*podepsan)/i;
const NOT_SIGNED = /(not[_ -]?signed|nepodepsan|draft|navrh|návrh)/i;
const APPROVAL = /(building[_ -]?office[_ -]?approval|occupancy|souhlas|kolaudac)/i;

const projects = (b.projects || []).map(p => {
  const docs = (p.documents || []).map(x => (typeof x === 'string' ? x : x.name || ''));
  const contractSigned = docs.some(n => SIGNED.test(n) && !NOT_SIGNED.test(n));
  const contractDraft = docs.some(n => NOT_SIGNED.test(n));
  const approval = docs.some(n => APPROVAL.test(n));
  const entries = (p.entries || []).slice().sort((a, c) => String(a.week).localeCompare(String(c.week)));
  const latest = entries[entries.length - 1] || null;

  const flags = [];
  if (!contractSigned) flags.push({ severity: 'blocker', text: contractDraft ? 'Contract not signed yet (draft only)' : 'No contract in the project folder' });
  if (!approval) flags.push({ severity: 'info', text: 'No building office approval in the folder yet' });
  if (entries.length === 0) flags.push({ severity: 'warning', text: 'No weekly report yet' });

  return {
    id: p.id ?? null,
    name: p.name,
    company: p.company || '',
    weeks_reported: entries.length,
    latest_week: latest?.week ?? null,
    is_new_project: entries.length <= 1,
    documents: docs,
    checklist: {
      contract_signed: contractSigned,
      contract_draft_only: !contractSigned && contractDraft,
      building_office_approval: approval,
    },
    flags,
    open_issues: (latest?.issues || []).filter(i => (i.severity || 'info') !== 'info'),
    latest_summary: latest?.project_page_entry?.body ?? latest?.summary ?? '',
  };
});

return [{
  json: {
    started_ms: Date.now(),
    week: b.week || '',
    model: b.model || 'gpt-4o-mini',
    language: b.language || 'en',
    projects,
  },
}];
