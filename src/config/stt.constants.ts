export const SPEECH_TO_TEXT_PROVIDERS = [
  {
    id: "groq-stt",
    name: "Groq Whisper (Fast & Free)",
    curl: `curl -X POST https://api.groq.com/openai/v1/audio/transcriptions \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F model=whisper-large-v3 \\
      -F response_format=json \\
      -F language=en`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "openai-whisper",
    name: "OpenAI Whisper",
    curl: `curl -X POST "https://api.openai.com/v1/audio/transcriptions" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F model=whisper-1`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "elevenlabs-stt",
    name: "ElevenLabs Speech-to-Text",
    curl: `curl -X POST "https://api.elevenlabs.io/v1/speech-to-text" \\
      -H "xi-api-key: {{API_KEY}}" \\
      -F "file={{AUDIO}}" \\
      -F model_id=scribe_v1`,
    responseContentPath: "text",
    streaming: false,
  },
  {
    id: "deepgram-stt",
    name: "Deepgram Speech-to-Text",
    curl: `curl -X POST "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true" \\
      -H "Authorization: Token {{API_KEY}}" \\
      -H "Content-Type: audio/wav" \\
      --data-binary {{AUDIO}}`,
    responseContentPath: "results.channels[0].alternatives[0].transcript",
    streaming: false,
  },
  {
    id: "azure-stt",
    name: "Azure Speech-to-Text",
    curl: `curl -X POST "https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US" \\
      -H "Ocp-Apim-Subscription-Key: {{API_KEY}}" \\
      -H "Content-Type: audio/wav" \\
      --data-binary {{AUDIO}}`,
    responseContentPath: "DisplayText",
    streaming: false,
  }
];