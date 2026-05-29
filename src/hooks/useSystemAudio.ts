import { useEffect, useState, useCallback, useRef } from "react";
import { useWindowResize, useGlobalShortcuts } from ".";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/contexts";
import { fetchSTT, fetchAIResponse } from "@/lib/functions";
import {
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_SYSTEM_PROMPT,
  STORAGE_KEYS,
} from "@/config";
import {
  safeLocalStorage,
  shouldUseShunyaAPI,
  generateConversationTitle,
  saveConversation,
  CONVERSATION_SAVE_DEBOUNCE_MS,
  generateConversationId,
  generateMessageId,
} from "@/lib";
import { Message } from "@/types/completion";

export interface VadConfig {
  enabled: boolean;
  hop_size: number;
  sensitivity_rms: number;
  peak_threshold: number;
  silence_chunks: number;
  min_speech_chunks: number;
  pre_speech_chunks: number;
  noise_gate_threshold: number;
  max_recording_duration_secs: number;
}

const DEFAULT_VAD_CONFIG: VadConfig = {
  enabled: true,
  hop_size: 1024,
  sensitivity_rms: 0.012,
  peak_threshold: 0.035,
  silence_chunks: 45,
  min_speech_chunks: 7,
  pre_speech_chunks: 12,
  noise_gate_threshold: 0.003,
  max_recording_duration_secs: 180,
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type useSystemAudioType = ReturnType<typeof useSystemAudio>;

export function useSystemAudio() {
  const { resizeWindow } = useWindowResize();
  const globalShortcuts = useGlobalShortcuts();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [lastAIResponse, setLastAIResponse] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [isManagingQuickActions, setIsManagingQuickActions] = useState<boolean>(false);
  const [showQuickActions, setShowQuickActions] = useState<boolean>(true);
  const [vadConfig, setVadConfig] = useState<VadConfig>(DEFAULT_VAD_CONFIG);
  const [recordingProgress, setRecordingProgress] = useState<number>(0);
  const [isContinuousMode, setIsContinuousMode] = useState<boolean>(false);
  const [isRecordingInContinuousMode, setIsRecordingInContinuousMode] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const [conversation, setConversation] = useState<ChatConversation>({
    id: "",
    title: "",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  });
  const [useSystemPrompt, setUseSystemPrompt] = useState<boolean>(true);
  const [contextContent, setContextContent] = useState<string>("");

  const {
    selectedSttProvider,
    allSttProviders,
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    selectedAudioDevices,
  } = useApp();

  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load saved settings
  useEffect(() => {
    const savedContext = safeLocalStorage.getItem(STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT);
    if (savedContext) {
      try {
        const parsed = JSON.parse(savedContext);
        setUseSystemPrompt(parsed.useSystemPrompt ?? true);
        setContextContent(parsed.contextContent ?? "");
      } catch (error) {
        console.error("Failed to load system audio context:", error);
      }
    }
    const savedVadConfig = safeLocalStorage.getItem("vad_config");
    if (savedVadConfig) {
      try {
        setVadConfig(JSON.parse(savedVadConfig));
      } catch (error) {
        console.error("Failed to load VAD config:", error);
      }
    }
  }, []);

  useEffect(() => {
    const savedActions = safeLocalStorage.getItem(STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS);
    if (savedActions) {
      try {
        setQuickActions(JSON.parse(savedActions));
      } catch (error) {
        setQuickActions(DEFAULT_QUICK_ACTIONS);
      }
    } else {
      setQuickActions(DEFAULT_QUICK_ACTIONS);
    }
  }, []);

  // Continuous recording listeners
  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let startUnlisten: (() => void) | undefined;
    let stopUnlisten: (() => void) | undefined;
    let errorUnlisten: (() => void) | undefined;
    let discardedUnlisten: (() => void) | undefined;

    const setupContinuousListeners = async () => {
      try {
        progressUnlisten = await listen("recording-progress", (event) => {
          setRecordingProgress(event.payload as number);
        });
        startUnlisten = await listen("continuous-recording-start", () => {
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(true);
        });
        stopUnlisten = await listen("continuous-recording-stopped", () => {
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(false);
        });
        errorUnlisten = await listen("audio-encoding-error", (event) => {
          console.error("Audio encoding error:", event.payload);
          setError(`Failed to process audio: ${event.payload}`);
          setIsProcessing(false);
          setIsAIProcessing(false);
          setIsRecordingInContinuousMode(false);
        });
        discardedUnlisten = await listen("speech-discarded", (event) => {
          console.log("Speech discarded:", event.payload);
        });
      } catch (err) {
        console.error("Failed to setup continuous recording listeners:", err);
      }
    };

    setupContinuousListeners();

    return () => {
      if (progressUnlisten) progressUnlisten();
      if (startUnlisten) startUnlisten();
      if (stopUnlisten) stopUnlisten();
      if (errorUnlisten) errorUnlisten();
      if (discardedUnlisten) discardedUnlisten();
    };
  }, []);

  // ============================================
  // AI PROCESSING - DEFINED BEFORE speech-detected useEffect
  // ============================================
  const processWithAI = useCallback(
    async (transcription: string, prompt: string, previousMessages: Message[]) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setIsAIProcessing(true);
        setLastAIResponse("");
        setError("");

        let fullResponse = "";

        const useShunyaAPI = await shouldUseShunyaAPI();
        if (!selectedAIProvider.provider && !useShunyaAPI) {
          setError("No AI provider selected.");
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider && !useShunyaAPI) {
          setError("AI provider config not found.");
          return;
        }

        try {
          for await (const chunk of fetchAIResponse({
            provider: useShunyaAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: prompt,
            history: previousMessages,
            userMessage: transcription,
            imagesBase64: [],
          })) {
            fullResponse += chunk;
            setLastAIResponse((prev) => prev + chunk);
          }
        } catch (aiError: any) {
          setError(aiError.message || "Failed to get AI response");
        }

        if (fullResponse) {
          const timestamp = Date.now();
          setConversation((prev) => ({
            ...prev,
            messages: [
              {
                id: generateMessageId("user", timestamp),
                role: "user" as const,
                content: transcription,
                timestamp,
              },
              {
                id: generateMessageId("assistant", timestamp + 1),
                role: "assistant" as const,
                content: fullResponse,
                timestamp: timestamp + 1,
              },
              ...prev.messages,
            ],
            updatedAt: timestamp,
            title: prev.title || generateConversationTitle(transcription),
          }));
        }
      } catch (err) {
        setError("Failed to get AI response");
      } finally {
        setIsAIProcessing(false);
      }
    },
    [selectedAIProvider, allAiProviders, conversation.messages]
  );

  // ============================================
  // SPEECH DETECTED - Auto AI response with 20s cooldown
  // ============================================
  useEffect(() => {
    let speechUnlisten: (() => void) | undefined;

    const setupEventListener = async () => {
      try {
        speechUnlisten = await listen("speech-detected", async (event) => {
          try {
            if (!capturing) return;

            const base64Audio = event.payload as string;
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: "audio/wav" });

            const useShunyaAPI = await shouldUseShunyaAPI();
            if (!selectedSttProvider.provider && !useShunyaAPI) {
              setError("No speech provider selected.");
              return;
            }

            const providerConfig = allSttProviders.find(
              (p) => p.id === selectedSttProvider.provider
            );

            if (!providerConfig && !useShunyaAPI) {
              setError("Speech provider config not found.");
              return;
            }

            setIsProcessing(true);

            const sttPromise = fetchSTT({
              provider: providerConfig,
              selectedProvider: selectedSttProvider,
              audio: audioBlob,
            });

            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(
                () => reject(new Error("Speech transcription timed out (30s)")),
                30000
              );
            });

            try {
              const transcription = await Promise.race([sttPromise, timeoutPromise]);

              if (transcription.trim()) {
                setLastTranscription(transcription);
                setLiveTranscript((prev) => [...prev, transcription]);
                setError("");

                // AUTO AI: Interview response with 20s cooldown to avoid 429
                const now = Date.now();
                const lastCall = parseInt(localStorage.getItem("shunya_last_ai_call") || "0");
                if (now - lastCall >= 20000) {
                  localStorage.setItem("shunya_last_ai_call", String(now));
                  const prompt = "AI interview assistant. Answer under 40 words. Be direct. No fluff.";
                  const prevMsgs = conversation.messages.slice(-2).map((m) => ({
                    role: m.role,
                    content: m.content,
                  }));
                  processWithAI(transcription, prompt, prevMsgs);
                }
              } else {
                setError("Received empty transcription");
              }
            } catch (sttError: any) {
              console.error("STT Error:", sttError);
              setError(sttError.message || "Failed to transcribe audio");
              setIsPopoverOpen(true);
            }
          } catch (err) {
            setError("Failed to process speech");
          } finally {
            setIsProcessing(false);
          }
        });
      } catch (err) {
        setError("Failed to setup speech listener");
      }
    };

    setupEventListener();

    return () => {
      if (speechUnlisten) speechUnlisten();
    };
  }, [capturing, selectedSttProvider, allSttProviders, conversation.messages, processWithAI]);

  // ============================================
  // CONTEXT MANAGEMENT
  // ============================================
  const saveContextSettings = useCallback(
    (usePrompt: boolean, content: string) => {
      try {
        safeLocalStorage.setItem(
          STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT,
          JSON.stringify({ useSystemPrompt: usePrompt, contextContent: content })
        );
      } catch (error) {
        console.error("Failed to save context settings:", error);
      }
    },
    []
  );

  const updateUseSystemPrompt = useCallback(
    (value: boolean) => {
      setUseSystemPrompt(value);
      saveContextSettings(value, contextContent);
    },
    [contextContent, saveContextSettings]
  );

  const updateContextContent = useCallback(
    (content: string) => {
      setContextContent(content);
      saveContextSettings(useSystemPrompt, content);
    },
    [useSystemPrompt, saveContextSettings]
  );

  // Quick actions
  const saveQuickActions = useCallback((actions: string[]) => {
    try {
      safeLocalStorage.setItem(STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS, JSON.stringify(actions));
    } catch (error) {
      console.error("Failed to save quick actions:", error);
    }
  }, []);

  const addQuickAction = useCallback(
    (action: string) => {
      if (action && !quickActions.includes(action)) {
        const newActions = [...quickActions, action];
        setQuickActions(newActions);
        saveQuickActions(newActions);
      }
    },
    [quickActions, saveQuickActions]
  );

  const removeQuickAction = useCallback(
    (action: string) => {
      const newActions = quickActions.filter((a) => a !== action);
      setQuickActions(newActions);
      saveQuickActions(newActions);
    },
    [quickActions, saveQuickActions]
  );

  const handleQuickActionClick = async (action: string) => {
    setError("");

    const effectiveSystemPrompt = useSystemPrompt
      ? systemPrompt || DEFAULT_SYSTEM_PROMPT
      : contextContent || DEFAULT_SYSTEM_PROMPT;

    const recentContext = liveTranscript.slice(-5).join(" \n");
    const contextForAI = recentContext || lastTranscription;

    let updatedMessages = [...conversation.messages];

    if (contextForAI && contextForAI.trim()) {
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      if (!lastMessage || lastMessage.content !== contextForAI) {
        const timestamp = Date.now();
        const userMessage = {
          id: generateMessageId("user", timestamp),
          role: "user" as const,
          content: `[Meeting Context]: ${contextForAI}`,
          timestamp,
        };
        updatedMessages.push(userMessage);

        setConversation((prev) => ({
          ...prev,
          messages: [userMessage, ...prev.messages],
          updatedAt: timestamp,
          title: prev.title || generateConversationTitle(contextForAI),
        }));
      }
    }

    const previousMessages = updatedMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    await processWithAI(action, effectiveSystemPrompt, previousMessages);
    setLiveTranscript([]);
  };

  const startContinuousRecording = useCallback(async () => {
    try {
      setRecordingProgress(0);
      setError("");
      const deviceId =
        selectedAudioDevices.output.id !== "default" ? selectedAudioDevices.output.id : null;
      await invoke<string>("start_system_audio_capture", { vadConfig: vadConfig, deviceId: deviceId });
    } catch (err) {
      console.error("Failed to start continuous recording:", err);
      setError(`Failed to start recording: ${err}`);
    }
  }, [vadConfig, selectedAudioDevices.output.id]);

  const ignoreContinuousRecording = useCallback(async () => {
    try {
      if (!isContinuousMode || !isRecordingInContinuousMode) return;
      await invoke<string>("stop_system_audio_capture");
      setRecordingProgress(0);
      setIsProcessing(false);
      setIsRecordingInContinuousMode(false);
    } catch (err) {
      console.error("Failed to ignore recording:", err);
      setError(`Failed to ignore recording: ${err}`);
    }
  }, [isContinuousMode, isRecordingInContinuousMode]);

  const startCapture = useCallback(async () => {
    try {
      setError("");
      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (!hasAccess) {
        setSetupRequired(true);
        setIsPopoverOpen(true);
        return;
      }

      const isContinuous = !vadConfig.enabled;
      const conversationId = generateConversationId("sysaudio");
      setConversation({ id: conversationId, title: "", messages: [], createdAt: 0, updatedAt: 0 });
      setCapturing(true);
      setIsPopoverOpen(true);
      setIsContinuousMode(isContinuous);
      setRecordingProgress(0);
      setLiveTranscript([]);

      if (isContinuous) {
        setIsRecordingInContinuousMode(false);
        return;
      }

      await invoke<string>("stop_system_audio_capture");
      const deviceId =
        selectedAudioDevices.output.id !== "default" ? selectedAudioDevices.output.id : null;
      await invoke<string>("start_system_audio_capture", { vadConfig: vadConfig, deviceId: deviceId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsPopoverOpen(true);
    }
  }, [vadConfig, selectedAudioDevices.output.id]);

  const stopCapture = useCallback(async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      await invoke<string>("stop_system_audio_capture");
      setCapturing(false);
      setIsProcessing(false);
      setIsAIProcessing(false);
      setIsContinuousMode(false);
      setIsRecordingInContinuousMode(false);
      setRecordingProgress(0);
      setLastTranscription("");
      setLastAIResponse("");
      setError("");
      setIsPopoverOpen(false);
      setLiveTranscript([]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop capture: ${errorMessage}`);
    }
  }, []);

  const manualStopAndSend = useCallback(async () => {
    try {
      if (!isContinuousMode) return;
      setIsProcessing(true);
      await invoke("manual_stop_continuous");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to manually stop: ${errorMessage}`);
      setIsProcessing(false);
    }
  }, [isContinuousMode]);

  const handleSetup = useCallback(async () => {
    try {
      const platform = navigator.platform.toLowerCase();
      if (platform.includes("mac") || platform.includes("win")) {
        await invoke("request_system_audio_access");
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (hasAccess) {
        setSetupRequired(false);
        await startCapture();
      } else {
        setSetupRequired(true);
        setError("Permission not granted. Please try the manual steps.");
      }
    } catch (err) {
      setError("Failed to request access. Please try the manual steps below.");
      setSetupRequired(true);
    }
  }, [startCapture]);

  useEffect(() => {
    const shouldOpenPopover = capturing || setupRequired || isAIProcessing || !!lastAIResponse || !!error;
    setIsPopoverOpen(shouldOpenPopover);
    resizeWindow(shouldOpenPopover);
  }, [capturing, setupRequired, isAIProcessing, lastAIResponse, error, resizeWindow]);

  useEffect(() => {
    globalShortcuts.registerSystemAudioCallback(async () => {
      if (capturing) { await stopCapture(); } else { await startCapture(); }
    });
  }, [startCapture, stopCapture]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) { abortControllerRef.current.abort(); }
      invoke("stop_system_audio_capture").catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
    if (!conversation.id || conversation.updatedAt === 0 || conversation.messages.length === 0) return;
    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;
      try {
        isSavingRef.current = true;
        await saveConversation(conversation);
      } catch (error) {
        console.error("Failed to save system audio conversation:", error);
      } finally {
        isSavingRef.current = false;
      }
    }, CONVERSATION_SAVE_DEBOUNCE_MS);
    return () => { if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); } };
  }, [conversation.messages.length, conversation.title, conversation.id, conversation.updatedAt]);

  const startNewConversation = useCallback(() => {
    setConversation({ id: generateConversationId("sysaudio"), title: "", messages: [], createdAt: 0, updatedAt: 0 });
    setLastTranscription("");
    setLastAIResponse("");
    setError("");
    setSetupRequired(false);
    setIsProcessing(false);
    setIsAIProcessing(false);
    setIsPopoverOpen(false);
    setUseSystemPrompt(true);
    setLiveTranscript([]);
  }, []);

  const updateVadConfiguration = useCallback(async (config: VadConfig) => {
    try {
      setVadConfig(config);
      safeLocalStorage.setItem("vad_config", JSON.stringify(config));
      await invoke("update_vad_config", { config });
    } catch (error) {
      console.error("Failed to update VAD config:", error);
    }
  }, []);

  useEffect(() => {
    if (capturing) {
      setIsContinuousMode(!vadConfig.enabled);
      if (!vadConfig.enabled) { setIsRecordingInContinuousMode(false); }
    }
  }, [capturing, vadConfig.enabled]);

  return {
    isPopoverOpen,
    setIsPopoverOpen,
    capturing,
    isProcessing,
    isAIProcessing,
    lastTranscription,
    lastAIResponse,
    error,
    setupRequired,
    quickActions,
    isManagingQuickActions,
    setIsManagingQuickActions,
    showQuickActions,
    setShowQuickActions,
    vadConfig,
    isContinuousMode,
    isRecordingInContinuousMode,
    recordingProgress,
    conversation,
    useSystemPrompt,
    contextContent,
    liveTranscript,
    scrollAreaRef,
    startCapture,
    stopCapture,
    manualStopAndSend,
    handleSetup,
    handleQuickActionClick,
    addQuickAction,
    removeQuickAction,
    startNewConversation,
    updateVadConfiguration,
    updateUseSystemPrompt,
    updateContextContent,
    startContinuousRecording,
    ignoreContinuousRecording,
  };
}