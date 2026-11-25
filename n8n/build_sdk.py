"""Generates n8n Workflow SDK code (n8n/sdk/*.ts) from the Code-node sources in n8n/code/.
The SDK code is what was used to create the workflows in n8n through the n8n MCP server."""
import json, pathlib
HERE = pathlib.Path(__file__).parent
js = lambda f: json.dumps((HERE / "code" / f).read_text(encoding="utf-8"), ensure_ascii=False)
(HERE / "sdk").mkdir(exist_ok=True)
MODEL = "gpt-4o-mini"

wf1 = f"""import {{ workflow, node, trigger, sticky, newCredential, ifElse, expr }} from '@n8n/workflow-sdk';

const siteReportWebhook = trigger({{
  type: 'n8n-nodes-base.webhook', version: 2.2,
  config: {{ name: 'Site report webhook', parameters: {{ httpMethod: 'POST', path: 'site-report', responseMode: 'responseNode', options: {{}} }} }},
  output: [{{ body: {{ project: {{ name: '02_BESS_container', company: 'AGRO NWT', client_name: 'Client B', consent_name_allowed: false, notes: 'Container BESS 500 kW / 1 MWh' }}, week: '2026-W47', transcript: '[00:05] New this week: the battery container arrived.', photo_urls: [] }} }}]
}});

const normalizeInput = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Normalize input', parameters: {{ jsCode: {js('wf1_normalize.js')} }} }},
  output: [{{ project: {{ name: '02_BESS_container', company: 'AGRO NWT', client_name: 'Client B', consent_name_allowed: false, notes: 'Container BESS 500 kW / 1 MWh' }}, week: '2026-W47', media_url: '', transcript: '[00:05] New this week: the battery container arrived.', photo_urls: [], needs_stt: false, stt_model: 'scribe_v1', stt_language: 'ces', started_ms: 0 }}]
}});

const videoToTranscribe = ifElse({{
  version: 2.2,
  config: {{ name: 'Video to transcribe?', parameters: {{ conditions: {{
    options: {{ caseSensitive: true, leftValue: '', typeValidation: 'strict' }},
    conditions: [{{ leftValue: expr('{{{{ $json.needs_stt }}}}'), operator: {{ type: 'boolean', operation: 'true', singleValue: true }} }}],
    combinator: 'and' }} }} }}
}});

const elevenLabsStt = node({{
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {{
    name: 'ElevenLabs speech-to-text',
    parameters: {{
      method: 'POST', url: 'https://api.elevenlabs.io/v1/speech-to-text',
      authentication: 'genericCredentialType', genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: {{ parameters: [
        {{ name: 'model_id', value: expr('{{{{ $json.stt_model }}}}') }},
        {{ name: 'cloud_storage_url', value: expr('{{{{ $json.media_url }}}}') }},
        {{ name: 'language_code', value: expr('{{{{ $json.stt_language }}}}') }},
        {{ name: 'timestamps_granularity', value: 'word' }}
      ] }},
      options: {{ timeout: 300000 }}
    }},
    credentials: {{ httpTemplatedCustomAuth: newCredential('ElevenLabs API key') }}
  }},
  output: [{{ language_code: 'ces', text: 'Week 47, container arrived.', words: [{{ text: 'Week', start: 0, end: 0.3, type: 'word' }}] }}]
}});

const transcriptFromStt = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Transcript from STT', parameters: {{ jsCode: {js('wf1_stt_to_transcript.js')} }} }},
  output: [{{ transcript: '[00:00] Week 47, container arrived.', needs_stt: true }}]
}});

const buildPrompts = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Build prompts', parameters: {{ jsCode: {js('wf1_build_llm.js')} }} }},
  output: [{{ system_prompt: 'You are...', user_prompt: 'Project: ...', photo_prompt: 'You see ...', has_photos: true, photo_urls_csv: 'https://example.com/a.jpg' }}]
}});

const writeOutputs = node({{
  type: '@n8n/n8n-nodes-langchain.openAi', version: 2.3,
  config: {{
    name: 'Write outputs (OpenAI)',
    parameters: {{
      resource: 'text', operation: 'response',
      modelId: {{ __rl: true, mode: 'id', value: '{MODEL}' }},
      responses: {{ values: [{{ type: 'text', role: 'user', content: expr('{{{{ $json.user_prompt }}}}') }}] }},
      simplify: true,
      options: {{
        instructions: expr('{{{{ $json.system_prompt }}}}'),
        textFormat: {{ textOptions: {{ type: 'json_object' }} }},
        temperature: 0.2,
        maxTokens: 2500
      }}
    }},
    credentials: {{ openAiApi: newCredential('OpenAI') }}
  }},
  output: [{{ output: [{{ type: 'message', content: [{{ type: 'output_text', text: '{{"customer_report":{{"subject":"s","body":"b"}}}}' }}] }}] }}]
}});

const hasPhotos = ifElse({{
  version: 2.2,
  config: {{ name: 'Photos attached?', parameters: {{ conditions: {{
    options: {{ caseSensitive: true, leftValue: '', typeValidation: 'strict' }},
    conditions: [{{ leftValue: expr("{{{{ $('Build prompts').item.json.has_photos }}}}"), operator: {{ type: 'boolean', operation: 'true', singleValue: true }} }}],
    combinator: 'and' }} }} }}
}});

const pickBestPhoto = node({{
  type: '@n8n/n8n-nodes-langchain.openAi', version: 2.3,
  config: {{
    name: 'Pick best photo (OpenAI)',
    parameters: {{
      resource: 'image', operation: 'analyze',
      modelId: {{ __rl: true, mode: 'id', value: '{MODEL}' }},
      text: expr("{{{{ $('Build prompts').item.json.photo_prompt }}}}"),
      inputType: 'url',
      imageUrls: expr("{{{{ $('Build prompts').item.json.photo_urls_csv }}}}"),
      simplify: true,
      options: {{ detail: 'low', maxTokens: 800 }}
    }},
    credentials: {{ openAiApi: newCredential('OpenAI') }}
  }},
  output: [{{ type: 'message', content: [{{ type: 'output_text', text: '{{"best_photo_index":0,"photo_flags":[]}}' }}] }}]
}});

const parseAndCheck = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Parse + fact check', parameters: {{ jsCode: {js('wf1_parse_check.js')} }} }},
  output: [{{ week: '2026-W47', customer_report: {{ subject: 's', body: 'b' }}, fact_check: {{ status: 'ok', unverified_numbers: [], consent_ok: true }} }}]
}});

const respondToApp = node({{
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {{ name: 'Respond to app', parameters: {{ respondWith: 'firstIncomingItem', options: {{}} }} }}
}});

const note = sticky('## Weekly site report\\n**POST /webhook/site-report** with project (name, company, client_name, consent_name_allowed, notes), week, and `media_url` (public URL of the walk-through video) **or** `transcript`, optional `photo_urls`.\\n\\nReturns customer report, chronicle entry, social draft EN/CZ, best photo, issues and a **fact check** (every number must be in the sources, client-name consent respected).\\n\\n**Setup:** ElevenLabs node needs a credential with header `xi-api-key` = your key (only for videos).', [], {{ color: 7, width: 560, height: 300 }});

export default workflow('bizhack-site-report', 'BizHack 02 – Weekly site report (video → reports)', {{ settings: {{ executionOrder: 'v1', executionTimeout: 600 }} }})
  .add(note)
  .add(siteReportWebhook)
  .to(normalizeInput)
  .to(videoToTranscribe
    .onTrue(elevenLabsStt.to(transcriptFromStt.to(buildPrompts)))
    .onFalse(buildPrompts))
  .add(buildPrompts)
  .to(writeOutputs)
  .to(hasPhotos
    .onTrue(pickBestPhoto.to(parseAndCheck))
    .onFalse(parseAndCheck))
  .add(parseAndCheck)
  .to(respondToApp)
  .group('Speech to text', [elevenLabsStt, transcriptFromStt], {{ description: 'Only when a video URL is sent: ElevenLabs transcribes it into a timestamped transcript' }})
  .group('Guardrails', [parseAndCheck], {{ description: 'Every number must appear in the transcript or notes; client name only with consent; flagged photos never chosen' }});
"""

wf2 = f"""import {{ workflow, node, trigger, sticky, newCredential, expr }} from '@n8n/workflow-sdk';

const summaryWebhook = trigger({{
  type: 'n8n-nodes-base.webhook', version: 2.2,
  config: {{ name: 'Management summary webhook', parameters: {{ httpMethod: 'POST', path: 'management-summary', responseMode: 'responseNode', options: {{}} }} }},
  output: [{{ body: {{ week: '2026-W47', language: 'en', projects: [{{ name: '03_PV_family_house_battery', company: 'ENERGO NWT', documents: ['contract_draft_NOT_SIGNED.pdf'], entries: [{{ week: '2026-W47', issues: [] }}] }}] }} }}]
}});

const documentChecklist = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Document checklist', parameters: {{ jsCode: {js('wf2_checklist.js')} }} }},
  output: [{{ week: '2026-W47', language: 'en', started_ms: 0, projects: [{{ name: '03', checklist: {{ contract_signed: false, contract_draft_only: true, building_office_approval: false }}, flags: [], open_issues: [] }}] }}]
}});

const buildSummaryPrompts = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Build summary prompts', parameters: {{ jsCode: {js('wf2_build_llm.js')} }} }},
  output: [{{ system_prompt: 'You write...', user_prompt: 'Week: 2026-W47' }}]
}});

const writeSummary = node({{
  type: '@n8n/n8n-nodes-langchain.openAi', version: 2.3,
  config: {{
    name: 'Write summary (OpenAI)',
    parameters: {{
      resource: 'text', operation: 'response',
      modelId: {{ __rl: true, mode: 'id', value: '{MODEL}' }},
      responses: {{ values: [{{ type: 'text', role: 'user', content: expr('{{{{ $json.user_prompt }}}}') }}] }},
      simplify: true,
      options: {{
        instructions: expr('{{{{ $json.system_prompt }}}}'),
        textFormat: {{ textOptions: {{ type: 'json_object' }} }},
        temperature: 0.2,
        maxTokens: 3000
      }}
    }},
    credentials: {{ openAiApi: newCredential('OpenAI') }}
  }},
  output: [{{ output: [{{ type: 'message', content: [{{ type: 'output_text', text: '{{"headline":"h","summary_markdown":"# x"}}' }}] }}] }}]
}});

const combineSummary = node({{
  type: 'n8n-nodes-base.code', version: 2,
  config: {{ name: 'Combine summary + checklist', parameters: {{ jsCode: {js('wf2_parse.js')} }} }},
  output: [{{ week: '2026-W47', headline: 'h', totals: {{ projects: 1, contracts_missing: 1 }}, summary_markdown: '# x' }}]
}});

const respondSummary = node({{
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {{ name: 'Respond to app', parameters: {{ respondWith: 'firstIncomingItem', options: {{}} }} }}
}});

const note = sticky('## Weekly management summary\\n**POST /webhook/management-summary** with week and projects[] (name, company, documents = file names in the project folder, entries = outputs of the site-report workflow).\\n\\nReturns totals, the document checklist per project (signed contract? building office approval? new project?), attention list, highlights and a one-page Markdown summary for the CEO and head of construction.', [], {{ color: 7, width: 560, height: 260 }});

export default workflow('bizhack-management-summary', 'BizHack 02 – Weekly management summary + document checklist', {{ settings: {{ executionOrder: 'v1', executionTimeout: 300 }} }})
  .add(note)
  .add(summaryWebhook)
  .to(documentChecklist)
  .to(buildSummaryPrompts)
  .to(writeSummary)
  .to(combineSummary)
  .to(respondSummary);
"""
(HERE / "sdk" / "01_weekly_site_report.ts").write_text(wf1, encoding="utf-8")
(HERE / "sdk" / "02_management_summary.ts").write_text(wf2, encoding="utf-8")
print("ok")
