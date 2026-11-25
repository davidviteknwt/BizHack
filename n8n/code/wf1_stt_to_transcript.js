// Turn the ElevenLabs Speech-to-Text response into a timestamped transcript: "[mm:ss] sentence"
const input = $('Normalize input').first().json;
const stt = $input.first().json;
const words = (stt.words || []).filter(w => w.type !== 'spacing' && w.type !== 'audio_event');
const fmt = s => {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `[${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}]`;
};
const lines = [];
let cur = [], start = null, last = 0;
for (const w of words) {
  const ws = w.start ?? last;
  if (start === null) start = ws;
  if (cur.length && ws - last > 1.2) { // pause = new line
    lines.push(`${fmt(start)} ${cur.join(' ')}`); cur = []; start = ws;
  }
  cur.push(w.text);
  last = w.end ?? ws;
  if (/[.!?]$/.test(w.text) && cur.length > 4) { // sentence end
    lines.push(`${fmt(start)} ${cur.join(' ')}`); cur = []; start = null;
  }
}
if (cur.length) lines.push(`${fmt(start ?? 0)} ${cur.join(' ')}`);
let transcript = lines.length ? lines.join('\n') : String(stt.text || '').trim();
if (!transcript && !input.notes_text) throw new Error('Speech-to-text returned no text. Check the media_url and the ElevenLabs key.');
// Typed or dictated notes sent together with the video/audio are appended after the spoken transcript
if (input.notes_text) transcript = transcript ? `${transcript}\n[notes] ${input.notes_text}` : input.notes_text;
return [{ json: { ...input, transcript, stt_language_detected: stt.language_code ?? null } }];
