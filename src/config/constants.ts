// Storage keys
export const STORAGE_KEYS = {
  THEME: "theme",
  TRANSPARENCY: "transparency",
  SYSTEM_PROMPT: "system_prompt",
  SELECTED_SYSTEM_PROMPT_ID: "selected_system_prompt_id",
  SCREENSHOT_CONFIG: "screenshot_config",
  // add curl_ prefix because we are using curl to store the providers
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
  ACTIVE_LICENSE: "shunya_active_license", // SHUNYA: Added for Dashboard <-> Overlay Sync
} as const;

// Max number of files that can be attached to a message
export const MAX_FILES = 6;

// Default settings
export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Be concise, accurate, and friendly in your responses. IMPORTANT RULE FOR IMAGES: If the user attaches an image or screenshot, ALWAYS start your response with a '📷 Image Brief:' section. In this brief, concisely describe what is visible in the image. After the Image Brief, carefully check if there is any question, math problem, code error, or task visible IN the image itself. If there is any question or problem in the image, you MUST solve or answer it under a '✅ Answer:' section. Finally, answer any specific questions the user has typed about the image.";
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