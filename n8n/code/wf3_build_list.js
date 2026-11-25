// Combine everything into one record per project folder: photos, videos, documents, checklist, newest change, notes URL
const subs = $('Emit subfolders').all().map((i) => i.json);
const listings = $input.all().map((i) => i.json.value || []);
const byProject = new Map();
subs.forEach((s, idx) => {
  if (!byProject.has(s.project_id)) byProject.set(s.project_id, { ...s, files: [...s.top_files.map((f) => ({ ...f, folder: '' }))] });
  const rec = byProject.get(s.project_id);
  if (s.sub_id) for (const f of listings[idx] || []) if (f.file) rec.files.push({ name: f.name, mime: f.file?.mimeType ?? '', modified: f.lastModifiedDateTime, url: f['@microsoft.graph.downloadUrl'] ?? null, folder: s.sub_name });
});

const SIGNED = /(contract[_ -]?signed|signed[_ -]?contract|smlouva.*podepsan)/i;
const NOT_SIGNED = /(not[_ -]?signed|nepodepsan|draft|navrh|návrh)/i;
const APPROVAL = /(building[_ -]?office[_ -]?approval|souhlas|kolaudac|occupancy)/i;
const out = [];
for (const r of byProject.values()) {
  const docs = r.files.filter((f) => /\.(pdf|docx?|xlsx?)$/i.test(f.name)).map((f) => f.name);
  const notes = r.files.find((f) => /\.txt$/i.test(f.name) && /(site_manager_notes|notes|poznamk)/i.test(f.name) && f.folder === '')
    ?? r.files.find((f) => /\.txt$/i.test(f.name) && /(notes|poznamk)/i.test(f.name));
  const newest = [r.last_modified, ...r.files.map((f) => f.modified)].filter(Boolean).sort().pop();
  out.push({ json: {
    code: r.name,
    title: r.name.replace(/^\d+[_ -]*/, '').replace(/[_]+/g, ' ').trim(),
    web_url: r.web_url,
    last_change: newest,
    photos: r.files.filter((f) => /^image\//.test(f.mime) || /\.(jpe?g|png|heic|webp)$/i.test(f.name)).length,
    videos: r.files.filter((f) => /^video\//.test(f.mime) || /\.(mp4|mov|m4v|avi)$/i.test(f.name)).length,
    documents: docs,
    weeks: [...new Set(r.files.map((f) => f.folder).filter((x) => /^\d{4}-W\d{2}$/.test(x)))].sort(),
    checklist: {
      contract_signed: docs.some((n) => SIGNED.test(n) && !NOT_SIGNED.test(n)),
      contract_draft_only: !docs.some((n) => SIGNED.test(n) && !NOT_SIGNED.test(n)) && docs.some((n) => NOT_SIGNED.test(n)),
      building_office_approval: docs.some((n) => APPROVAL.test(n)),
    },
    notes_file: notes?.name ?? null,
    notes_url: notes?.url ?? '',
  } });
}
return out;
