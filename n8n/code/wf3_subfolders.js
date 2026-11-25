// For every project: keep its own files and emit one item per subfolder (documents, weekly folders) to list next
const projects = $('One item per project').all().map((i) => i.json);
const listings = $input.all().map((i) => i.json.value || []);
const out = [];
projects.forEach((p, idx) => {
  const kids = listings[idx] || [];
  const subs = kids.filter((k) => k.folder);
  const files = kids.filter((k) => k.file);
  const base = { ...p, top_files: files.map((f) => ({ name: f.name, mime: f.file?.mimeType ?? '', modified: f.lastModifiedDateTime, url: f['@microsoft.graph.downloadUrl'] ?? null })) };
  if (subs.length === 0) out.push({ json: { ...base, sub_id: null, sub_name: null } });
  for (const s of subs) out.push({ json: { ...base, sub_id: s.id, sub_name: s.name } });
});
return out;
