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
  selected_shunya_model?: string;
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
    licenseDetails,
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

      if (storage.selected_shunya_model) {
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

    // Machine ID — localStorage mein store karo
    let machineId = localStorage.getItem("shunya_machine_id") || "";
    if (!machineId) {
      machineId = crypto.randomUUID();
      localStorage.setItem("shunya_machine_id", machineId);
    }

    try {
      // Wake up server (non-blocking, don't fail if it times out)
      await wakeUpServer().catch(() => {});

      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch("https://api.agenticfoxlabs.com/api/verify-license", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              licenseKey: licenseKey.trim(),
              machineId: machineId,
            }),
            signal: AbortSignal.timeout(20000),
          });
          if (response.ok || response.status < 500) break;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
          else throw new Error("Failed to reach server after 3 attempts");
        }
      }
      if (!response) throw new Error("No response from server");

      const data = await response.json();

      if (data.valid) {
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
        setError(data.message || "Failed to activate license");
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

      // License details bhi clear karo
      localStorage.removeItem("shunya_license_details");
      localStorage.removeItem("shunya_machine_id");

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

  const renderLicenseBadge = () => {
    if (!hasActiveLicense) {
      return (
        <div style={{
          padding: "12px 16px",
          borderRadius: "12px",
          border: "1px solid rgba(239,68,68,0.2)",
          background: "rgba(239,68,68,0.05)"
        }}>
          <div style={{ color: "#f87171", fontSize: "13px", fontWeight: 600, marginBottom: 4 }}>
            No Active License
          </div>
          <div style={{ color: "#71717a", fontSize: "12px" }}>
            Activate a license to unlock all features
          </div>
        </div>
      );
    }

    const isLifetime = licenseDetails?.daysLeft === "Lifetime";
    const daysNum = typeof licenseDetails?.daysLeft === "number" ? licenseDetails.daysLeft : 0;
    const isExpiringSoon = !isLifetime && daysNum <= 7 && daysNum > 0;

    return (
      <div style={{
        padding: "12px 16px",
        borderRadius: "12px",
        border: isExpiringSoon ? "1px solid rgba(234,179,8,0.3)" : "1px solid rgba(34,197,94,0.2)",
        background: isExpiringSoon ? "rgba(234,179,8,0.05)" : "rgba(34,197,94,0.05)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{
            color: isExpiringSoon ? "#facc15" : "#4ade80",
            fontSize: "13px",
            fontWeight: 600
          }}>
            {licenseDetails?.plan ? (licenseDetails.plan.charAt(0).toUpperCase() + licenseDetails.plan.slice(1)) : "Pro"} Plan
          </span>
          <span style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "999px",
            background: isExpiringSoon ? "rgba(234,179,8,0.15)" : "rgba(34,197,94,0.15)",
            color: isExpiringSoon ? "#facc15" : "#4ade80"
          }}>
            Active
          </span>
        </div>
        <div style={{ color: isExpiringSoon ? "#fde68a" : "#a1a1aa", fontSize: "12px" }}>
          {isLifetime ? (
            "Lifetime license — never expires"
          ) : (
            `${isExpiringSoon ? "⚠️ " : ""}${daysNum} day${daysNum !== 1 ? "s" : ""} remaining`
          )}
        </div>
        {licenseDetails?.expiresAt && (
          <div style={{ color: "#52525b", fontSize: "11px", marginTop: 4 }}>
            Expires: {new Date(licenseDetails.expiresAt).toLocaleDateString("en-IN", {
              day: "numeric", month: "long", year: "numeric"
            })}
          </div>
        )}
      </div>
    );
  };

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

        {renderLicenseBadge()}

        <div className="space-y-2 mt-4">
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