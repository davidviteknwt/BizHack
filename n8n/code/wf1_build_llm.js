// Build the prompts for the OpenAI nodes: one text call for all outputs, one image call for photo selection
const d = $input.first().json;
const consentRule = d.project.consent_name_allowed
  ? 'The client name MAY be used in the social draft.'
  : 'The client name, address or any identifying detail of the client MUST NOT appear in the social draft. Describe the client generically (e.g. "an engineering company in the Zlín region").';

const system_prompt = `You are the reporting assistant of a Czech construction company in the NWT group (solar power plants, battery storage, buildings).
Every week a site manager records a short walk-through video and describes what was NEWLY BUILT since last week. You get the transcript and the project notes.
Write outputs for the customer, the project chronicle / site inspection meeting, marketing and management.

STRICT RULES
1. Use ONLY facts from the transcript and the project notes. Never invent numbers, dates, names, quotes or technical details.
2. Write every number exactly as it appears in the sources (same digits). If a number is not in the sources, leave it out.
3. Consent: ${consentRule}
4. Factual, friendly, short. No hype words, no emojis in customer_report and project_page_entry.

Return ONLY one JSON object with exactly these keys:
{
  "customer_report": {"subject": string, "body": string},
  "project_page_entry": {"title": string, "body": string},
  "social_draft": {"text_en": string, "text_cs": string, "hashtags": [string]},
  "issues": [{"text": string, "severity": "info" | "warning" | "blocker"}],
  "next_steps": [string]
}
- customer_report: weekly progress e-mail to the client in language "${d.customer_language}", 80-150 words: what was built this week, what comes next, anything the client must do.
- project_page_entry: chronicle entry in language "${d.output_language}", 40-90 words, short lines starting with "- ".
- social_draft: one post for website news / LinkedIn / Instagram, 40-70 words, in English (text_en) and Czech (text_cs), 3-6 hashtags.
- issues: delays, missing material, waiting for the client, safety. Empty list if none.`;

const user_prompt = `Project: ${d.project.name}
Company: ${d.project.company}
Week: ${d.week}

PROJECT NOTES:
${d.project.notes || '(none)'}

TRANSCRIPT OF THIS WEEK'S WALK-THROUGH VIDEO:
${d.transcript}`;

const photo_prompt = `You see ${d.photo_urls.length} photos from a construction site, in this order: index 0 to ${d.photo_urls.length - 1}.
Suggest the 3 best photos for a marketing post, best first (sharp, shows finished or impressive work, no recognisable faces, no readable car number plates). If there are fewer than 3 usable photos, suggest fewer.
photo_flags: list ONLY photos that show a recognisable human face or a readable car number plate. Equipment, buildings and panels are never a reason to flag. If no photo has a face or plate, return an empty list.
Return ONLY JSON: {"suggested": [{"index": number, "reason": string}], "photo_flags": [{"index": number, "reason": string}]}`;

return [{
  json: {
    ...d,
    system_prompt,
    user_prompt,
    photo_prompt,
    has_photos: d.photo_urls.length > 0,
    photo_urls_csv: d.photo_urls.join(','),
  },
}];
