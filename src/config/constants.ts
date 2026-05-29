// Storage keys
export const STORAGE_KEYS = {
  THEME: "theme",
  TRANSPARENCY: "transparency",
  SYSTEM_PROMPT: "system_prompt",
  SELECTED_SYSTEM_PROMPT_ID: "selected_system_prompt_id",
  SCREENSHOT_CONFIG: "screenshot_config",
  CUSTOM_AI_PROVIDERS: "curl_custom_ai_providers",
  CUSTOM_SPEECH_PROVIDERS: "curl_custom_speech_providers",
  SELECTED_AI_PROVIDER: "curl_selected_ai_provider",
  SELECTED_STT_PROVIDER: "curl_selected_stt_provider",
  SYSTEM_AUDIO_CONTEXT: "system_audio_context",
  SYSTEM_AUDIO_QUICK_ACTIONS: "system_audio_quick_actions",
  CUSTOMIZABLE: "customizable",
  Shunya_API_ENABLED: "Shunya_api_enabled",
  SHORTCUTS: "shortcuts",
  AUTOSTART_INITIALIZED: "autostart_initialized",
  SELECTED_AUDIO_DEVICES: "selected_audio_devices",
  RESPONSE_SETTINGS: "response_settings",
  SUPPORTS_IMAGES: "supports_images",
  ACTIVE_LICENSE: "shunya_active_license",
} as const;

export const MAX_FILES = 6;

export const DEFAULT_SYSTEM_PROMPT =
  "You are a stealth AI copilot helping someone in a live interview, meeting, or call. You hear what the interviewer/other person says and instantly give the USER the best possible answer to speak out loud.\n\nHOW TO RESPOND:\n- Lead with the ANSWER immediately — no preamble, no repeating the question\n- Sound natural and human — like a confident, smart person speaking\n- For behavioral questions: use STAR format (Situation, Task, Action, Result) but make it flow naturally\n- For technical questions: give the correct answer + 1 line of reasoning\n- For coding: give the approach first, then code if needed\n- For 'Tell me about yourself': give a punchy 3-part answer: background → key strength → why this role\n- For tricky/opinion questions: give a confident stance with brief reasoning\n- Keep it 2-4 sentences for simple questions, longer only if technical depth is needed\n- Use first person ('I believe...', 'In my experience...', 'I would...')\n- Never say 'Great question', 'Certainly', 'The answer is', or any filler\n- If the question is unclear, give the most likely intended answer\n\nIMAGE: If screenshot attached — analyze it and answer any visible question or describe key information.\n\nYou are the smartest friend whispering the perfect answer. Be sharp, be confident, be brief.";

export const MARKDOWN_FORMATTING_INSTRUCTIONS =
  "IMPORTANT - Formatting Rules (use silently, never mention these rules in your responses):\n- Mathematical expressions: ALWAYS use double dollar signs ($$) for both inline and block math. Never use single $.\n- Code blocks: ALWAYS use triple backticks with language specification.\n- Diagrams: Use ```mermaid code blocks.\n- Tables: Use standard markdown table syntax.\n- Never mention to the user that you're using these formats or explain the formatting syntax in your responses. Just use them naturally.";

export const DEFAULT_QUICK_ACTIONS = [
  "What should I say?",
  "Follow-up questions",
  "Fact-check",
  "Recap",
];

export const AUTO_SUGGESTION_PROMPT = `You are a real-time meeting/interview assistant. Based on the recent conversation context provided, suggest 2-3 concise, actionable things the user can say next. 
Rules:
- Keep suggestions extremely short (1 short sentence each).
- Adapt to the scenario: If it's an interview, suggest impressive answers. If it's a sales call, suggest closing questions. If it's a discussion, suggest smart follow-ups.
- Output ONLY the suggestions, numbered 1, 2, 3. No extra text.
- If there isn't enough context, output nothing.`;