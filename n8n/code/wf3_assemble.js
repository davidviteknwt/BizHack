// Attach the notes text, parse company / client / consent, mark new projects and pick the recommended one
const s = $('Scan settings').first().json;
const root = $('Pick projects folder').first().json;
const list = $('Build project list').all().map((i) => i.json);
const notesTexts = $input.all().map((i) => (typeof i.json.data === 'string' ? i.json.data : ''));
const norm = (x) => String(x || '').toLowerCase().replace(/[\s_\-]+/g, '');
const existing = new Set(s.existing_codes.map(norm));

const projects = list.map((p, idx) => {
  const notes = (p.notes_url ? notesTexts[idx] : '') || '';
  const line = (k) => (notes.match(new RegExp(`^${k}:\\s*(.+)$`, 'mi')) || [])[1]?.trim() ?? '';
  const consent = line('Consent to a reference');
  const quoted = (line('Project').match(/"([^"]+)"/) || [])[1] ?? '';
  return {
    ...p,
    notes_url: undefined,
    notes: notes.slice(0, 4000),
    company: line('Company'),
    client_name: quoted,
    consent_name_allowed: /^yes/i.test(consent) && !/(without|no name|only village|not the|anonym)/i.test(consent),
    is_new: !existing.has(norm(p.code)),
  };
});
const fresh = projects.filter((p) => p.is_new).sort((a, b) => String(b.last_change).localeCompare(String(a.last_change)));
return [{ json: {
  scanned_folder: root.root_name,
  scanned_folder_url: root.root_url,
  scanned_at: new Date().toISOString(),
  total_folders: projects.length,
  new_projects: fresh,
  recommended: fresh[0] ?? null,
  known_projects: projects.filter((p) => !p.is_new).map((p) => p.code),
  processing_seconds: Math.round((Date.now() - s.started_ms) / 100) / 10,
} }];
