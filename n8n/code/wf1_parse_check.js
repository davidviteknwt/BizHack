// Parse both OpenAI answers and run the guardrails:
// every number must exist in the sources, client-name consent must be respected, flagged photos are never chosen
const d = $('Build prompts').first().json;

const findText = (x) => {
  if (x == null) return null;
  if (Array.isArray(x)) { for (const v of x) { const t = findText(v); if (t != null) return t; } return null; }
  if (typeof x === 'object') {
    if ((x.type === 'output_text' || x.type === undefined) && x.text != null && typeof x.text !== 'undefined') return x.text;
    for (const k of ['output', 'content', 'message', 'choices']) { if (x[k] != null) { const t = findText(x[k]); if (t != null) return t; } }
    return null;
  }
  return null;
};
const toJson = (raw, what) => {
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(s); } catch (e) { throw new Error(`${what}: the model did not return valid JSON: ${s.slice(0, 400)}`); }
};

const out = toJson(findText($('Write outputs (OpenAI)').first().json), 'Write outputs');
let photo = { best_photo_index: null, photo_flags: [] };
let photo_error = null;
try {
  const p = $('Pick best photo (OpenAI)').first().json;
  if (p?.error) photo_error = String(p.error?.message ?? p.error);
  const pt = findText(p);
  if (pt != null) photo = toJson(pt, 'Pick best photo');
} catch (e) {
  // photo step did not run (no photos) or failed: the texts are still delivered
  if (!/not executed|hasn't been executed|has not been executed|No node|no data/i.test(String(e.message))) photo_error = String(e.message);
}

// ---- Fact check: numbers -------------------------------------------------
const NUM = /\d+(?:[.,]\d+)?/g;
const variants = (s) => {
  const v = new Set([s, s.replace(/,/g, '.'), s.replace(/,/g, ''), s.replace(/\./g, ',')]);
  const n = parseFloat(s.replace(/,/g, '.'));
  if (!Number.isNaN(n)) v.add(String(n));
  return [...v];
};
// join thousands written with a space ("1 816", Czech style) so they are read as one number
const joinThousands = (t) => String(t).replace(/(\d)[\s\u00a0\u202f](?=\d{3}(?!\d))/g, '$1');
const sourceText = joinThousands([d.transcript, d.project.notes, d.week, d.project.name].join(' '));
const sourceSet = new Set();
for (const m of sourceText.match(NUM) || []) variants(m).forEach((x) => sourceSet.add(x));

const texts = {
  customer_report: `${out.customer_report?.subject ?? ''} ${out.customer_report?.body ?? ''}`,
  project_page_entry: `${out.project_page_entry?.title ?? ''} ${out.project_page_entry?.body ?? ''}`,
  social_en: out.social_draft?.text_en ?? '',
  social_cs: out.social_draft?.text_cs ?? '',
  web_news_en: `${out.web_news?.title_en ?? ''} ${out.web_news?.body_en ?? ''}`,
  web_news_cs: `${out.web_news?.title_cs ?? ''} ${out.web_news?.body_cs ?? ''}`,
};
const unverified = [];
for (const [field, t] of Object.entries(texts)) {
  for (const m of joinThousands(t).match(NUM) || []) {
    if (/^\d$/.test(m)) continue; // single digits (list numbering) are not checked
    if (!variants(m).some((x) => sourceSet.has(x))) unverified.push({ field, number: m });
  }
}

// ---- Consent check -------------------------------------------------------
const social = `${texts.social_en} ${texts.social_cs} ${texts.web_news_en} ${texts.web_news_cs}`.toLowerCase();
const client = (d.project.client_name || '').trim().toLowerCase();
const consent_ok = d.project.consent_name_allowed || !client || !social.includes(client);

// ---- Photos --------------------------------------------------------------
const flags = (photo.photo_flags || []).filter((f) => Number.isInteger(f.index));
const flagged = new Set(flags.map((f) => f.index));
// up to 3 suggestions, best first; flagged photos are never suggested; fill up with unflagged photos
const legacy = Number.isInteger(photo.best_photo_index) ? [{ index: photo.best_photo_index, reason: photo.best_photo_reason ?? '' }] : [];
const suggested = [];
for (const s of [...(photo.suggested || []), ...legacy]) {
  if (Number.isInteger(s.index) && d.photo_urls[s.index] && !flagged.has(s.index) && !suggested.some((x) => x.index === s.index)) suggested.push({ index: s.index, reason: s.reason ?? '', url: d.photo_urls[s.index] });
}
d.photo_urls.forEach((u, i) => { if (suggested.length < 3 && !flagged.has(i) && !suggested.some((x) => x.index === i)) suggested.push({ index: i, reason: 'not ranked', url: u }); });
const suggested_photos = suggested.slice(0, 3);
const best_photo_url = suggested_photos[0]?.url ?? null;

return [{
  json: {
    project_id: d.project.id,
    project_name: d.project.name,
    week: d.week,
    transcript: d.transcript,
    customer_report: out.customer_report ?? null,
    project_page_entry: out.project_page_entry ?? null,
    social_draft: out.social_draft ?? null,
    web_news: out.web_news ?? null,
    best_photo_url,
    best_photo_reason: suggested_photos[0]?.reason ?? null,
    suggested_photos,
    photo_error,
    photo_flags: flags.map((f) => ({ ...f, url: d.photo_urls[f.index] ?? null })),
    issues: out.issues || [],
    next_steps: out.next_steps || [],
    fact_check: {
      status: unverified.length === 0 && consent_ok ? 'ok' : 'needs_review',
      unverified_numbers: unverified,
      consent_ok,
      numbers_checked: (Object.values(texts).join(' ').match(NUM) || []).length,
    },
    processing_seconds: Math.round((Date.now() - d.started_ms) / 100) / 10,
  },
}];
