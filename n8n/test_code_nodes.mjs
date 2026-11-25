// Offline test of the Code-node logic (no n8n, no API keys). Run: node n8n/test_code_nodes.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = new URL('./code/', import.meta.url);
const run = (file, input, named = {}) => {
  const src = fs.readFileSync(new URL(file, dir), 'utf8');
  const $input = { first: () => ({ json: input }) };
  const $ = (n) => {
    if (!(n in named)) throw new Error(`Node '${n}' hasn't been executed`);
    return { first: () => ({ json: named[n] }) };
  };
  return new Function('$input', '$', src)($input, $)[0].json;
};
// Responses API shape returned by the n8n OpenAI node (simplify = true)
const resp = (obj) => ({ output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: '```json\n' + JSON.stringify(obj) + '\n```' }] }] });

// ---- WF1: transcript path with photos
const body = {
  project: { name: '02_BESS_container', company: 'AGRO NWT', client_name: 'Client B', consent_name_allowed: false,
             notes: 'Container BESS 500 kW / 1 MWh next to an existing PV plant of 1.2 MWp.' },
  week: '2026-W47',
  transcript: '[00:05] New this week: the battery container arrived. The crane set it on the slab, it took two hours.',
  photo_urls: ['https://x/a.jpg', 'https://x/b.jpg'],
};
const norm = run('wf1_normalize.js', { body });
assert.equal(norm.needs_stt, false);
const prompts = run('wf1_build_llm.js', norm);
assert.equal(prompts.has_photos, true);
assert.equal(prompts.photo_urls_csv, 'https://x/a.jpg,https://x/b.jpg');
assert.match(prompts.system_prompt, /MUST NOT appear/);

const llm = resp({
  customer_report: { subject: 'Week 47', body: 'The 500 kW / 1 MWh container arrived on the slab.' },
  project_page_entry: { title: '2026-W47', body: '- Container placed\n- 1.2 MWp plant connected' },
  social_draft: { text_en: 'Client B gets 750 kWh of storage.', text_cs: 'Kontejner 1 MWh je na místě.', hashtags: ['#BESS'] },
  issues: [], next_steps: ['Commissioning'] });
const photo = resp({ suggested: [{ index: 0, reason: 'r' }, { index: 1, reason: 'r2' }], photo_flags: [{ index: 0, reason: 'face' }] });
const out = run('wf1_parse_check.js', null, { 'Build prompts': prompts, 'Write outputs (OpenAI)': llm, 'Pick best photo (OpenAI)': photo });
console.log('fact_check:', JSON.stringify(out.fact_check));
assert.equal(out.fact_check.status, 'needs_review');
assert.deepEqual(out.fact_check.unverified_numbers.map((u) => u.number), ['750']);
assert.equal(out.fact_check.consent_ok, false);
assert.equal(out.best_photo_url, 'https://x/b.jpg', 'flagged photo 0 must not be chosen');

// No photos: photo node never ran; decimal comma vs dot must pass
const p2 = run('wf1_build_llm.js', run('wf1_normalize.js', { body: { project: { name: 'P', consent_name_allowed: true }, week: '2026-W47', transcript: 'Panels 412 x 545 Wp = 224,5 kWp' } }));
assert.equal(p2.has_photos, false);
const ok = run('wf1_parse_check.js', null, { 'Build prompts': p2, 'Write outputs (OpenAI)': resp({
  customer_report: { subject: 's', body: '412 panels, 224.5 kWp' }, project_page_entry: { title: '', body: '' },
  social_draft: { text_en: '224.5 kWp', text_cs: '224,5 kWp' } }) });
assert.equal(ok.fact_check.status, 'ok');
assert.equal(ok.best_photo_url, null);

// ---- WF1: STT path
const normV = run('wf1_normalize.js', { body: { ...body, transcript: '', media_url: 'https://x/v.mp4' } });
assert.equal(normV.needs_stt, true);
const stt = { language_code: 'ces', words: [
  { text: 'Week', start: 0, end: 0.3, type: 'word' }, { text: ' ', type: 'spacing', start: 0.3, end: 0.3 },
  { text: '47,', start: 0.3, end: 0.6, type: 'word' }, { text: 'container', start: 0.7, end: 1.1, type: 'word' },
  { text: 'arrived', start: 1.2, end: 1.5, type: 'word' }, { text: 'today.', start: 1.5, end: 1.9, type: 'word' },
  { text: 'Crane', start: 5.0, end: 5.3, type: 'word' }, { text: 'took', start: 5.3, end: 5.5, type: 'word' },
  { text: 'two', start: 5.5, end: 5.7, type: 'word' }, { text: 'hours.', start: 5.7, end: 6.0, type: 'word' } ] };
const tr = run('wf1_stt_to_transcript.js', stt, { 'Normalize input': normV });
assert.match(tr.transcript, /^\[00:00\] Week 47, container arrived today\.\n\[00:05\] Crane took two hours\.$/);

// ---- WF2
const cl = run('wf2_checklist.js', { body: { week: '2026-W47', projects: [
  { name: '01', documents: ['contract_signed.pdf', 'building_office_approval.pdf'], entries: [{ week: '2026-W46' }, { week: '2026-W47', issues: [{ text: 'breaker', severity: 'warning' }] }] },
  { name: '02', documents: ['contract_signed.pdf'], entries: [{ week: '2026-W47' }] },
  { name: '03', documents: ['contract_draft_NOT_SIGNED.pdf'], entries: [{ week: '2026-W47' }] },
] } });
const c = Object.fromEntries(cl.projects.map((p) => [p.name, p.checklist]));
assert.deepEqual(c['01'], { contract_signed: true, contract_draft_only: false, building_office_approval: true });
assert.deepEqual(c['02'], { contract_signed: true, contract_draft_only: false, building_office_approval: false });
assert.deepEqual(c['03'], { contract_signed: false, contract_draft_only: true, building_office_approval: false });
const sp = run('wf2_build_llm.js', cl);
const sum = run('wf2_parse.js', resp({ headline: 'h', attention: [], highlights: [], summary_markdown: '# x' }), { 'Build summary prompts': sp });
assert.deepEqual(sum.totals, { projects: 3, contracts_missing: 1, approvals_present: 1, new_projects: 2, open_issues: 1 });
assert.equal(sum.summary_markdown, '# x');
console.log('ALL CODE-NODE TESTS PASSED');

// photo step failed (continueRegularOutput gives {error}) -> texts still delivered
const failed = run('wf1_parse_check.js', null, { 'Build prompts': prompts, 'Write outputs (OpenAI)': llm, 'Pick best photo (OpenAI)': { error: { message: 'Upstream status code: 404' } } });
assert.match(failed.photo_error, /404/);
assert.equal(failed.best_photo_url, 'https://x/a.jpg');
console.log('PHOTO-FAILURE TEST PASSED');

// Czech thousands separator with a space must match "1,816" in the source
const p4 = run('wf1_build_llm.js', run('wf1_normalize.js', { body: { project: { name: 'P4', consent_name_allowed: true }, week: '2026-W47', transcript: 'all 1,816 panels are installed, 998.8 kWp' } }));
const r4 = run('wf1_parse_check.js', null, { 'Build prompts': p4, 'Write outputs (OpenAI)': resp({
  customer_report: { subject: 's', body: '1,816 panels' }, project_page_entry: { title: '', body: '' },
  social_draft: { text_en: '1816 panels, 998.8 kWp', text_cs: 'Všech 1 816 panelů, 998,8 kWp' } }) });
assert.equal(r4.fact_check.status, 'ok', JSON.stringify(r4.fact_check));
console.log('THOUSANDS TEST PASSED');

// 3 suggestions, flagged excluded, filled up
const p5 = run('wf1_build_llm.js', run('wf1_normalize.js', { body: { project: { name: 'P5' }, week: 'W', transcript: 't', photo_urls: ['u0','u1','u2','u3','u4'] } }));
assert.match(p5.photo_prompt, /3 best photos/);
const r5 = run('wf1_parse_check.js', null, { 'Build prompts': p5, 'Write outputs (OpenAI)': resp({ customer_report: {}, social_draft: {} }),
  'Pick best photo (OpenAI)': resp({ suggested: [{ index: 3, reason: 'a' }, { index: 1, reason: 'b' }], photo_flags: [{ index: 0, reason: 'face' }] }) });
assert.deepEqual(r5.suggested_photos.map((x) => x.url), ['u3', 'u1', 'u2']);
assert.equal(r5.best_photo_url, 'u3');
console.log('3-PHOTO TEST PASSED');
