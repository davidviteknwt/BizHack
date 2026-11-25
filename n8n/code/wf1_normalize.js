// Normalize input – accepts the JSON body sent by Lovable or scripts/run_demo.py
const raw = $input.first().json;
const b = raw.body ?? raw;
const p = b.project || {};
const input = {
  started_ms: Date.now(),
  project: {
    id: p.id ?? null,
    name: p.name ?? 'Unnamed project',
    company: p.company ?? '',
    client_name: p.client_name ?? '',
    consent_name_allowed: p.consent_name_allowed !== false,
    notes: p.notes ?? '',
  },
  week: b.week ?? '',
  media_url: b.media_url ?? b.video_url ?? b.audio_url ?? '',
  transcript: String(b.transcript ?? '').trim(),
  photo_urls: Array.isArray(b.photo_urls) ? b.photo_urls.slice(0, 8) : [],
  output_language: b.output_language ?? 'en',
  customer_language: b.customer_language ?? b.output_language ?? 'en',
  stt_language: b.stt_language ?? 'ces',
  stt_model: b.stt_model ?? 'scribe_v1',
  model: b.model ?? 'gpt-4o-mini',
};
if (!input.transcript && !input.media_url) {
  throw new Error('Send either "transcript" (text) or "media_url" (public URL of the walk-through video).');
}
input.needs_stt = !input.transcript && !!input.media_url;
return [{ json: input }];
