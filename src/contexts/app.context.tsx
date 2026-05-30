import {
  AI_PROVIDERS,
  DEFAULT_SYSTEM_PROMPT,
  SPEECH_TO_TEXT_PROVIDERS,
  STORAGE_KEYS,
} from "@/config";
import { wakeUpServer } from "@/lib/functions/Shunya.api";
import { getPlatform, safeLocalStorage, trackAppStart } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import {
  getCustomizableState,
  setCustomizableState,
  updateAppIconVisibility,
  updateAlwaysOnTop,
  updateAutostart,
  CustomizableState,
  DEFAULT_CUSTOMIZABLE_STATE,
  CursorType,
  updateCursorType,
} from "@/lib/storage";
import { IContextType, ScreenshotConfig, TYPE_PROVIDER } from "@/types";
import curl2Json from "@bany/curl-to-json";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable } from "@tauri-apps/plugin-autostart";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const validateAndProcessCurlProviders = (
  providersJson: string,
  providerType: "AI" | "STT"
): TYPE_PROVIDER[] => {
  try {
    const parsed = JSON.parse(providersJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((p) => {
        try {
          curl2Json(p.curl);
          return true;
        } catch (e) {
          return false;
        }
      })
      .map((p) => {
        const provider = { ...p, isCustom: true };
        if (providerType === "STT" && provider.curl) {
          provider.curl = provider.curl.replace(/AUDIO_BASE64/g, "AUDIO");
        }
        return provider;
      });
  } catch (e) {
    console.warn(`Failed to parse custom ${providerType} providers`, e);
    return [];
  }
};

const AppContext = createContext<IContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [systemPrompt, setSystemPrompt] = useState<string>(
    safeLocalStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) ||
      DEFAULT_SYSTEM_PROMPT
  );

  const [selectedAudioDevices, setSelectedAudioDevices] = useState<{
    input: { id: string; name: string };
    output: { id: string; name: string };
  }>(() => {
    const savedDevices = safeLocalStorage.getItem(
      STORAGE_KEYS.SELECTED_AUDIO_DEVICES
    );
    if (savedDevices) {
      try {
        return JSON.parse(savedDevices);
      } catch {}
    }
    return {
      input: { id: "", name: "" },
      output: { id: "", name: "" },
    };
  });

  const [customAiProviders, setCustomAiProviders] = useState<TYPE_PROVIDER[]>(
    []
  );
  const [selectedAIProvider, setSelectedAIProvider] = useState<{
    provider: string;
    variables: Record<string, string>;
  }>({
    provider: "",
    variables: {},
  });

  const [customSttProviders, setCustomSttProviders] = useState<TYPE_PROVIDER[]>(
    []
  );
  const [selectedSttProvider, setSelectedSttProvider] = useState<{
    provider: string;
    variables: Record<string, string>;
  }>({
    provider: "",
    variables: {},
  });

  const [screenshotConfiguration, setScreenshotConfiguration] =
    useState<ScreenshotConfig>({
      mode: "manual",
      autoPrompt: "Analyze this screenshot and provide insights",
      enabled: true,
    });

  const [customizable, setCustomizable] = useState<CustomizableState>(
    DEFAULT_CUSTOMIZABLE_STATE
  );

  const [hasActiveLicense, setHasActiveLicenseState] = useState<boolean>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.ACTIVE_LICENSE) === "true";
  });

  const setHasActiveLicense = (value: boolean | ((prev: boolean) => boolean)) => {
    const newValue = typeof value === 'function' ? value(hasActiveLicense) : value;
    setHasActiveLicenseState(newValue);
    safeLocalStorage.setItem(STORAGE_KEYS.ACTIVE_LICENSE, String(newValue));
  };

  const [supportsImages, setSupportsImagesState] = useState<boolean>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.SUPPORTS_IMAGES);
    return stored === null ? true : stored === "true";
  });

  const setSupportsImages = (value: boolean) => {
    setSupportsImagesState(value);
    safeLocalStorage.setItem(STORAGE_KEYS.SUPPORTS_IMAGES, String(value));
  };

  const [ShunyaApiEnabled, setShunyaApiEnabledState] = useState<boolean>(false);

  // License details state
  const [licenseDetails, setLicenseDetails] = useState<{
    plan: string;
    expiresAt: string | null;
    daysLeft: number | string;
  } | null>(() => {
    // Cache se load karo taaki instantly dikhe
    const cached = safeLocalStorage.getItem("shunya_license_details");
    if (cached) {
      try { return JSON.parse(cached); } catch { return null; }
    }
    return null;
  });

  // ===== FIXED: machine_id ab localStorage mein store hota hai =====
    const getActiveLicenseStatus = async () => {
    try {
      const storage = await invoke<{ license_key?: string }>("secure_storage_get");

      if (storage.license_key) {
        let machineId = safeLocalStorage.getItem("shunya_machine_id") || "";
        if (!machineId) {
          machineId = crypto.randomUUID();
          safeLocalStorage.setItem("shunya_machine_id", machineId);
        }

        await wakeUpServer().catch(() => {});

        let response: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            response = await fetch("https://api.agenticfoxlabs.com/api/verify-license", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseKey: storage.license_key,
                machineId: machineId,
              }),
              signal: AbortSignal.timeout(20000),
            });
            if (response.ok || response.status < 500) break;
          } catch {
            if (attempt < 2) await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
            else throw new Error("Server unreachable");
          }
        }
        if (!response) throw new Error("No response");

        const data = await response.json();
        setHasActiveLicense(data.valid === true);

        if (data.valid) {
          // Calculate days remaining
          let daysLeft: number | string = "Lifetime";
          if (data.expires_at) {
            const diffTime = new Date(data.expires_at).getTime() - Date.now();
            daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          }

          const details = {
            plan: data.plan || "Pro",
            expiresAt: data.expires_at || null,
            daysLeft: daysLeft,
          };

          setLicenseDetails(details);
          safeLocalStorage.setItem("shunya_license_details", JSON.stringify(details));
        } else {
          setLicenseDetails(null);
          safeLocalStorage.removeItem("shunya_license_details");
          setShunyaApiEnabled(false);
        }
      } else {
        setHasActiveLicense(false);
        setLicenseDetails(null);
        safeLocalStorage.removeItem("shunya_license_details");
      }
    } catch (error) {
      console.error("Failed to validate license on startup:", error);
      const localStatus = safeLocalStorage.getItem(STORAGE_KEYS.ACTIVE_LICENSE) === "true";
      setHasActiveLicense(localStatus);
    }
  };
 
 useEffect(() => {
    const syncLicenseState = async () => {
      try {
        await invoke("set_license_status", {
          hasLicense: hasActiveLicense,
        });
        const config = getShortcutsConfig();
        await invoke("update_shortcuts", { config });
      } catch (error) {
        console.error("Failed to synchronize license state:", error);
      }
    };
    syncLicenseState();
  }, [hasActiveLicense]);

  const loadData = () => {
    const savedSystemPrompt = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_PROMPT
    );
    if (savedSystemPrompt) {
      setSystemPrompt(savedSystemPrompt || DEFAULT_SYSTEM_PROMPT);
    }

    const savedScreenshotConfig = safeLocalStorage.getItem(
      STORAGE_KEYS.SCREENSHOT_CONFIG
    );
    if (savedScreenshotConfig) {
      try {
        const parsed = JSON.parse(savedScreenshotConfig);
        if (typeof parsed === "object" && parsed !== null) {
          setScreenshotConfiguration({
            mode: parsed.mode || "manual",
            autoPrompt:
              parsed.autoPrompt ||
              "Analyze this screenshot and provide insights",
            enabled: parsed.enabled !== undefined ? parsed.enabled : false,
          });
        }
      } catch {
        console.warn("Failed to parse screenshot configuration");
      }
    }

    const savedAi = safeLocalStorage.getItem(STORAGE_KEYS.CUSTOM_AI_PROVIDERS);
    let aiList: TYPE_PROVIDER[] = [];
    if (savedAi) {
      aiList = validateAndProcessCurlProviders(savedAi, "AI");
    }
    setCustomAiProviders(aiList);

    const savedStt = safeLocalStorage.getItem(
      STORAGE_KEYS.CUSTOM_SPEECH_PROVIDERS
    );
    let sttList: TYPE_PROVIDER[] = [];
    if (savedStt) {
      sttList = validateAndProcessCurlProviders(savedStt, "STT");
    }
    setCustomSttProviders(sttList);

    const savedSelectedAi = safeLocalStorage.getItem(
      STORAGE_KEYS.SELECTED_AI_PROVIDER
    );
    if (savedSelectedAi) {
      setSelectedAIProvider(JSON.parse(savedSelectedAi));
    }

    const savedSelectedStt = safeLocalStorage.getItem(
      STORAGE_KEYS.SELECTED_STT_PROVIDER
    );
    if (savedSelectedStt) {
      setSelectedSttProvider(JSON.parse(savedSelectedStt));
    }

    const customizableState = getCustomizableState();
    setCustomizable(customizableState);
    updateCursor(customizableState.cursor.type || "invisible");

    const stored = safeLocalStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE);
    if (!stored) {
      setCustomizableState(customizableState);
    } else {
      try {
        const parsed = JSON.parse(stored);
        if (!parsed.autostart) {
          setCustomizableState(customizableState);
          updateCursor(customizableState.cursor.type || "invisible");
        }
      } catch (error) {
        console.debug("Failed to check customizable state schema:", error);
      }
    }

    setShunyaApiEnabledState(false);

    const savedAudioDevices = safeLocalStorage.getItem(
      STORAGE_KEYS.SELECTED_AUDIO_DEVICES
    );
    if (savedAudioDevices) {
      try {
        const parsed = JSON.parse(savedAudioDevices);
        if (parsed && typeof parsed === "object") {
          setSelectedAudioDevices(parsed);
        }
      } catch {
        console.warn("Failed to parse selected audio devices");
      }
    }
  };

  const updateCursor = (type: CursorType | undefined) => {
    try {
      const currentWindow = getCurrentWindow();
      const platform = getPlatform();
      if (platform === "linux") {
        document.documentElement.style.setProperty("--cursor-type", "default");
        return;
      }
      const windowLabel = currentWindow.label;
      if (windowLabel === "dashboard") {
        document.documentElement.style.setProperty("--cursor-type", "default");
        return;
      }
      const safeType = type || "invisible";
      const cursorValue = type === "invisible" ? "none" : safeType;
      document.documentElement.style.setProperty("--cursor-type", cursorValue);
    } catch (error) {
      document.documentElement.style.setProperty("--cursor-type", "default");
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      await getActiveLicenseStatus();
      try {
        const appVersion = await invoke<string>("get_app_version");
        const storage = await invoke<{
          instance_id: string;
        }>("secure_storage_get");
        await trackAppStart(appVersion, storage.instance_id || "");
      } catch (error) {
        console.debug("Failed to track app start:", error);
      }
    };
    loadData();
    initializeApp();
  }, []);

  useEffect(() => {
    const handleAppIconVisibility = async (isVisible: boolean) => {
      try {
        await invoke("set_app_icon_visibility", { visible: isVisible });
      } catch (error) {
        console.error("Failed to set app icon visibility:", error);
      }
    };
    const unlistenHide = listen("handle-app-icon-on-hide", async () => {
      const currentState = getCustomizableState();
      if (!currentState.appIcon.isVisible) {
        await handleAppIconVisibility(false);
      }
    });
    const unlistenShow = listen("handle-app-icon-on-show", async () => {
      await handleAppIconVisibility(true);
    });
    return () => {
      unlistenHide.then((fn) => fn());
      unlistenShow.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SUPPORTS_IMAGES && e.newValue !== null) {
        setSupportsImagesState(e.newValue === "true");
      }
      if (e.key === STORAGE_KEYS.ACTIVE_LICENSE && e.newValue !== null) {
        setHasActiveLicenseState(e.newValue === "true");
      }
      if (
        e.key === STORAGE_KEYS.CUSTOM_AI_PROVIDERS ||
        e.key === STORAGE_KEYS.SELECTED_AI_PROVIDER ||
        e.key === STORAGE_KEYS.CUSTOM_SPEECH_PROVIDERS ||
        e.key === STORAGE_KEYS.SELECTED_STT_PROVIDER ||
        e.key === STORAGE_KEYS.SYSTEM_PROMPT ||
        e.key === STORAGE_KEYS.SCREENSHOT_CONFIG ||
        e.key === STORAGE_KEYS.CUSTOMIZABLE ||
        e.key === STORAGE_KEYS.SELECTED_AUDIO_DEVICES
      ) {
        loadData();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    const checkImageSupport = async () => {
      if (ShunyaApiEnabled) {
        try {
          const storage = await invoke<{
            selected_shunya_model?: string;
          }>("secure_storage_get");
          if (storage.selected_shunya_model) {
            const model = JSON.parse(storage.selected_shunya_model);
            const hasImageSupport = model.modality?.includes("image") ?? false;
            setSupportsImages(hasImageSupport);
          } else {
            setSupportsImages(false);
          }
        } catch (error) {
          setSupportsImages(false);
        }
      } else {
        setSupportsImages(true);
      }
    };
    checkImageSupport();
  }, [ShunyaApiEnabled, selectedAIProvider.provider]);

  useEffect(() => {
    if (selectedAIProvider.provider) {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SELECTED_AI_PROVIDER,
        JSON.stringify(selectedAIProvider)
      );
    }
  }, [selectedAIProvider]);

  useEffect(() => {
    if (selectedSttProvider.provider) {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SELECTED_STT_PROVIDER,
        JSON.stringify(selectedSttProvider)
      );
    }
  }, [selectedSttProvider]);

  const allAiProviders: TYPE_PROVIDER[] = [
    ...AI_PROVIDERS,
    ...customAiProviders,
  ];

  const allSttProviders: TYPE_PROVIDER[] = [
    ...SPEECH_TO_TEXT_PROVIDERS,
    ...customSttProviders,
  ];

  const onSetSelectedAIProvider = ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    if (provider && !allAiProviders.some((p) => p.id === provider)) {
      console.warn(`Invalid AI provider ID: ${provider}`);
      return;
    }
    if (!ShunyaApiEnabled) {
      setSupportsImages(true);
    }
    setSelectedAIProvider((prev) => ({
      ...prev,
      provider,
      variables,
    }));
  };

  const onSetSelectedSttProvider = ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    if (provider && !allSttProviders.some((p) => p.id === provider)) {
      console.warn(`Invalid STT provider ID: ${provider}`);
      return;
    }
    setSelectedSttProvider((prev) => ({ ...prev, provider, variables }));
  };

  const toggleAppIconVisibility = async (isVisible: boolean) => {
    const newState = updateAppIconVisibility(isVisible);
    setCustomizable(newState);
    try {
      await invoke("set_app_icon_visibility", { visible: isVisible });
      loadData();
    } catch (error) {
      console.error("Failed to toggle app icon visibility:", error);
    }
  };

  const toggleAlwaysOnTop = async (isEnabled: boolean) => {
    const newState = updateAlwaysOnTop(isEnabled);
    setCustomizable(newState);
    try {
      await invoke("set_always_on_top", { enabled: isEnabled });
      loadData();
    } catch (error) {
      console.error("Failed to toggle always on top:", error);
    }
  };

  const toggleAutostart = async (isEnabled: boolean) => {
    const newState = updateAutostart(isEnabled);
    setCustomizable(newState);
    try {
      if (isEnabled) {
        await enable();
      } else {
        await disable();
      }
      loadData();
    } catch (error) {
      console.error("Failed to toggle autostart:", error);
      const revertedState = updateAutostart(!isEnabled);
      setCustomizable(revertedState);
    }
  };

  const setCursorType = (type: CursorType) => {
    setCustomizable((prev) => ({ ...prev, cursor: { type } }));
    updateCursor(type);
    updateCursorType(type);
    loadData();
  };

  const setShunyaApiEnabled = async (enabled: boolean) => {
    setShunyaApiEnabledState(enabled);
    safeLocalStorage.setItem(STORAGE_KEYS.Shunya_API_ENABLED, String(enabled));

    if (enabled) {
      try {
        const storage = await invoke<{
          selected_shunya_model?: string;
        }>("secure_storage_get");
        if (storage.selected_shunya_model) {
          const model = JSON.parse(storage.selected_shunya_model);
          const hasImageSupport = model.modality?.includes("image") ?? false;
          setSupportsImages(hasImageSupport);
        } else {
          setSupportsImages(false);
        }
      } catch (error) {
        console.debug("Failed to check Shunya model image support:", error);
        setSupportsImages(false);
      }
    } else {
      setSupportsImages(true);
    }
    loadData();
  };

  const value: IContextType = {
    systemPrompt,
    setSystemPrompt,
    allAiProviders,
    customAiProviders,
    selectedAIProvider,
    onSetSelectedAIProvider,
    allSttProviders,
    customSttProviders,
    selectedSttProvider,
    onSetSelectedSttProvider,
    screenshotConfiguration,
    setScreenshotConfiguration,
    customizable,
    toggleAppIconVisibility,
    toggleAlwaysOnTop,
    toggleAutostart,
    loadData,
    ShunyaApiEnabled,
    setShunyaApiEnabled,
    hasActiveLicense,
    setHasActiveLicense,
    getActiveLicenseStatus,
    licenseDetails,
    selectedAudioDevices,
    setSelectedAudioDevices,
    setCursorType,
    supportsImages,
    setSupportsImages,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within a AppProvider");
  }
  return context;
};