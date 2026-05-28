import React, { useState, useEffect, useRef } from "react";
import { KeyIcon, TrashIcon, LoaderIcon, ChevronDown } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { wakeUpServer } from "@/lib/functions/Shunya.api";
import { useApp } from "@/contexts";
import {
  Button,
  Header,
  Input,
  Switch,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components";

interface StorageResult {
  license_key?: string;
  instance_id?: string;
  selected_shunya_model?: string; // Fixed: Chhota 's' Rust ke saath match karne ke liye
}

interface Model {
  provider: string;
  name: string;
  id: string;
  model: string;
  description: string;
  modality: string;
  isAvailable: boolean;
}

// Fixed: Storage keys exactly Rust backend ke saath match kar rahe hain
const LICENSE_KEY_STORAGE_KEY = "shunya_license_key";
const INSTANCE_ID_STORAGE_KEY = "shunya_instance_id";
const SELECTED_SHUNYA_MODEL_STORAGE_KEY = "selected_shunya_model";

export const ShunyaApiSetup = () => {
  const {
    ShunyaApiEnabled,
    setShunyaApiEnabled,
    hasActiveLicense,
    setHasActiveLicense,
    getActiveLicenseStatus,
    setSupportsImages,
  } = useApp();

  const [licenseKey, setLicenseKey] = useState("");
  const [storedLicenseKey, setStoredLicenseKey] = useState<string | null>(null);
  const [maskedLicenseKey, setMaskedLicenseKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [isModelsLoading, setIsModelsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const commandListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLicenseStatus();
  
  }, []);

  useEffect(() => {
    if (commandListRef.current) {
      commandListRef.current.scrollTop = 0;
    }
  }, [searchValue]);

  const fetchModels = async () => {
    setIsModelsLoading(true);
    try {
      const fetchedModels = await invoke<Model[]>("fetch_models");
      setModels(fetchedModels);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    } finally {
      setIsModelsLoading(false);
    }
  };

  const loadLicenseStatus = async () => {
    try {
      const storage = await invoke<StorageResult>("secure_storage_get");

      if (storage.license_key) {
        setStoredLicenseKey(storage.license_key);
        const masked = await invoke<string>("mask_license_key_cmd", {
          licenseKey: storage.license_key,
        });
        setMaskedLicenseKey(masked);
      } else {
        setStoredLicenseKey(null);
        setMaskedLicenseKey(null);
      }

      if (storage.selected_shunya_model) { // Fixed
        try {
          const storedModel = JSON.parse(storage.selected_shunya_model);
          setSelectedModel(storedModel);
        } catch (e) {
          console.error("Failed to parse stored model:", e);
          setSelectedModel(null);
        }
      } else {
        setSelectedModel(null);
      }
    } catch (err) {
      console.error("Failed to load license status:", err);
      setStoredLicenseKey(null);
      setMaskedLicenseKey(null);
      setSelectedModel(null);
    }
  };

    const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setError("Please enter a license key");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    // Step 1: Machine ID safe tarike se fetch ya generate karo
    let machineId = "fallback-pc-id"; 
    try {
      const storage = await invoke<{ machine_id?: string }>("secure_storage_get");
      if (storage && storage.machine_id) {
        machineId = storage.machine_id;
      } else {
        machineId = crypto.randomUUID();
        await invoke("secure_storage_save", {
          items: [{ key: "machine_id", value: machineId }],
        });
      }
    } catch (e) {
      console.warn("Machine ID fetch failed, using default", e);
    }

    try {
     await wakeUpServer();
await new Promise(resolve => setTimeout(resolve, 5000));
      const response = await fetch("https://api.agenticfoxlabs.com/api/verify-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey: licenseKey.trim(),
          machineId: machineId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        // Step 3: License valid hai, save karo
        await invoke("secure_storage_save", {
          items: [
            { key: "shunya_license_key", value: licenseKey.trim() },
          ],
        });

        setSuccess("Shunya Pro Activated successfully! 🦊");
        setLicenseKey("");
        setHasActiveLicense(true);
        await loadLicenseStatus();
        await getActiveLicenseStatus();
      } else {
        setError(data.error || "Failed to activate license");
      }
    } catch (err) {
      console.error("License activation failed:", err);
      setError("Failed to connect to Agentic Fox Labs server.");
    } finally {
      setIsLoading(false);
    }
  };
  const handleRemoveLicense = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setHasActiveLicense(false);
    try {
      await invoke("secure_storage_remove", {
        keys: [
          LICENSE_KEY_STORAGE_KEY,
          INSTANCE_ID_STORAGE_KEY,
          SELECTED_SHUNYA_MODEL_STORAGE_KEY,
        ],
      });

      setSuccess("License removed successfully!");
      setShunyaApiEnabled(false);

      await fetchModels();
      await loadLicenseStatus();
    } catch (err) {
      console.error("Failed to remove license:", err);
      setError("Failed to remove license");
    } finally {
      setIsLoading(false);
     }
  };

  const handleModelSelect = async (model: Model) => {
    setSelectedModel(model);
    setIsPopoverOpen(false);
    setSearchValue("");

    if (ShunyaApiEnabled) {
      const hasImageSupport = model.modality?.includes("image") ?? false;
      setSupportsImages(hasImageSupport);
    }

    try {
      await invoke("secure_storage_save", {
        items: [
          {
            key: SELECTED_SHUNYA_MODEL_STORAGE_KEY,
            value: JSON.stringify(model),
          },
        ],
      });
    } catch (error) {
      console.error("Failed to save model selection:", error);
      setError("Failed to save model selection.");
    }
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      setSearchValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !storedLicenseKey) {
      handleActivateLicense();
    }
  };

  const providers = [...new Set(models.map((model) => model.provider))];
  const capitalizedProviders = providers.map(
    (p) => p.charAt(0).toUpperCase() + p.slice(1)
  );

  let providerList;
  if (capitalizedProviders.length === 0) {
    providerList = null;
  } else if (capitalizedProviders.length === 1) {
    providerList = capitalizedProviders[0];
  } else if (capitalizedProviders.length === 2) {
    providerList = capitalizedProviders.join(" and ");
  } else {
    const lastProvider = capitalizedProviders.pop();
    providerList = `${capitalizedProviders.join(", ")}, and ${lastProvider}`;
  }

  const title = isModelsLoading
    ? "Loading Models..."
    : `Shunya supports ${models?.length} model${models?.length !== 1 ? "s" : ""}`;

  const description = isModelsLoading
    ? "Fetching the list of supported models..."
    : providerList
    ? `Access top models from providers like ${providerList}. Select smaller models for faster responses.`
    : "Explore all the models Shunya supports.";

  return (
    <div id="shunya-api" className="space-y-3 -mt-2">
      <div className="space-y-2 pt-2">
        {error && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <p className="text-sm text-green-700 dark:text-green-400">{success}</p>
          </div>
        )}
        <Header title={title} description={description} />
        <Popover modal={true} open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild disabled={isModelsLoading} className="cursor-pointer flex justify-start">
            <Button variant="outline" className="h-11 text-start shadow-none w-full">
              {selectedModel ? selectedModel.name : "Select pro models"} <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" className="w-[calc(100vw-20rem)] p-0 rounded-xl overflow-hidden">
            <Command shouldFilter={true}>
              <CommandInput placeholder="Select model..." value={searchValue} onValueChange={setSearchValue} />
              <CommandList ref={commandListRef} className="rounded-xl h-full overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/30">
                <CommandEmpty>No models found. Please try again later.</CommandEmpty>
                <CommandGroup className="h-full rounded-xl">
                  {models.map((model, index) => (
                    <CommandItem disabled={!model?.isAvailable} key={`${model?.id}-${index}`} className="cursor-pointer" onSelect={() => handleModelSelect(model)}>
                      <div className="flex flex-col">
                        <div className="flex flex-row items-center gap-2">
                          <p className="text-sm font-medium">{`${model?.name}`}</p>
                          <div className="text-xs border border-input/50 bg-muted/50 rounded-full px-2">{model?.modality}</div>
                          {model?.isAvailable ? (
                            <div className="text-xs text-orange-600 bg-white rounded-full px-2">{model?.provider}</div>
                          ) : (
                            <div className="text-xs text-red-600 bg-white rounded-full px-2">Not Available</div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2" title={model?.description}>{model?.description}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        
        {selectedModel && (
          <div className="text-xs text-amber-500 bg-amber-500/10 p-3 rounded-md">
            {selectedModel.modality?.includes("image")
              ? "This model accepts both text and images as input and generates text responses."
              : "⚠️ This model ONLY accepts text input. Do NOT upload images - they will not work with this model."}
          </div>
        )}
        
        <div className="space-y-2">
          {!storedLicenseKey ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">License Key</label>
                <p className="text-sm font-medium text-muted-foreground">
                  After completing your purchase, paste the license key below to activate.
                </p>
              </div>
              <div className="flex gap-2">
                <Input type="password" placeholder="Enter your license key" value={licenseKey} onChange={(value) => { setLicenseKey(typeof value === "string" ? value : value.target.value); setError(null); setSuccess(null); }} onKeyDown={handleKeyDown} disabled={isLoading} className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors" />
                <Button onClick={handleActivateLicense} disabled={isLoading || !licenseKey.trim()} size="icon" className="shrink-0 h-11 w-11" title="Activate License">
                  {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <KeyIcon className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <>
              <label className="text-xs lg:text-sm font-medium">Current License</label>
              <div className="flex gap-2">
                <Input type="text" value={maskedLicenseKey || ""} disabled={true} className="flex-1 h-11 border-1 border-input/50 bg-muted/50" />
                <Button onClick={handleRemoveLicense} disabled={isLoading} size="icon" variant="destructive" className="shrink-0 h-11 w-11" title="Remove License">
                  {isLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                </Button>
              </div>
              {storedLicenseKey && (
                <div className="-mt-1">
                  <p className="text-sm font-medium text-muted-foreground select-auto">
                    Need help? Contact our support team.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center">
        <Header title={`${ShunyaApiEnabled ? "Disable" : "Enable"} Shunya API`} description={storedLicenseKey ? ShunyaApiEnabled ? "Using all Shunya APIs for audio, and chat." : "Using all your own AI Providers for audio, and chat." : "A valid license is required to enable Shunya API or you can use your own AI Providers."} />
        <Switch checked={ShunyaApiEnabled} onCheckedChange={setShunyaApiEnabled} disabled={!storedLicenseKey || !hasActiveLicense} />
      </div>
    </div>
  );
};