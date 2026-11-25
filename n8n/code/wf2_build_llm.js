// Prompts for the one-page management summary, based only on the checklist data
const d = $input.first().json;
const system_prompt = `You write the weekly management summary for the CEO and the head of construction of a Czech construction company (solar, battery storage, buildings).
Use ONLY the data given. Never invent numbers or facts. Language: "${d.language}".
Return ONLY a JSON object:
{
  "headline": string,
  "attention": [{"project": string, "text": string}],
  "highlights": [{"project": string, "text": string}],
  "summary_markdown": string
}
- headline: one sentence on how the portfolio is doing this week.
- attention: what management must act on, blockers first (unsigned contracts, delays, waiting for the client).
- highlights: progress worth sharing, good candidates for marketing.
- summary_markdown: the full one-page summary in Markdown: headline, a table (Project | Latest week | Progress | Contract | Approval | Flags), then Attention and Highlights.`;
const user_prompt = `Week: ${d.week}\n\nPROJECTS (JSON):\n${JSON.stringify(d.projects, null, 1)}`;
return [{ json: { ...d, system_prompt, user_prompt } }];
