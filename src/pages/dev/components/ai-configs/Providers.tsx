import { Button, Header, Input, Selection, TextInput } from "@/components";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { KeyIcon, TrashIcon, ZapIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { detectProviderFromApiKey } from "@/lib";

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  variables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);

  const [detectedLabel, setDetectedLabel] = useState<string>("");
  const [isDetecting, setIsDetecting] = useState(false);
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedAIProvider?.provider) {
      const provider = allAiProviders?.find(
        (p) => p?.id === selectedAIProvider?.provider
      );
      if (provider) {
        const json = curl2Json(provider?.curl);
        setLocalSelectedProvider(json as ResultJSON);
      }
    }
  }, [selectedAIProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return variables?.find((v) => v?.key === key);
  };

  const getApiKeyValue = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider?.variables) return "";
    return selectedAIProvider?.variables?.[apiKeyVar.key] || "";
  };

  const isApiKeyEmpty = () => !getApiKeyValue().trim();

  const handleApiKeyChange = (rawValue: any) => {
    const value: string =
      typeof rawValue === "string" ? rawValue : rawValue?.target?.value ?? "";

    const currentProvider = selectedAIProvider?.provider || "";

    if (currentProvider) {
      onSetSelectedAIProvider({
        ...selectedAIProvider,
        variables: {
          ...selectedAIProvider.variables,
          api_key: value,
        },
      });
    }

    setIsDetecting(true);
    setDetectedLabel("");
    if (detectTimer.current) clearTimeout(detectTimer.current);

    detectTimer.current = setTimeout(() => {
      setIsDetecting(false);
      const detected = detectProviderFromApiKey(value);

      if (!detected) return;

      setDetectedLabel(detected.label);

      if (detected.providerId !== currentProvider) {
        onSetSelectedAIProvider({
          provider: detected.providerId,
          variables: { api_key: value },
        });
      } else {
        onSetSelectedAIProvider({
          ...selectedAIProvider,
          variables: {
            ...selectedAIProvider.variables,
            api_key: value,
          },
        });
      }
    }, 350);
  };

  return (
    <div className="space-y-4">
      {/* STEP 1: API KEY */}
      <div className="space-y-2">
        <Header
          title="API Key"
          description="Apni API key paste karo — provider automatically detect ho jaayega."
        />
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="Paste key: sk-..., gsk_..., AIza..., xai-..., pplx-..."
            value={getApiKeyValue()}
            onChange={handleApiKeyChange}
            onKeyDown={(e) => handleApiKeyChange(e.target)}
            disabled={false}
            className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
          />
          {!isApiKeyEmpty() ? (
            <Button
              onClick={() => {
                onSetSelectedAIProvider({
                  ...selectedAIProvider,
                  variables: {
                    ...selectedAIProvider.variables,
                    api_key: "",
                  },
                });
                setDetectedLabel("");
              }}
              size="icon"
              variant="destructive"
              className="shrink-0 h-11 w-11"
              title="Key hatao"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              disabled
              className="shrink-0 h-11 w-11 opacity-30"
            >
              <KeyIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Detection badge */}
        <div className="h-5 flex items-center">
          {isDetecting && getApiKeyValue().length > 6 && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Detecting...
            </span>
          )}
          {!isDetecting && detectedLabel && (
            <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
              <ZapIcon className="h-3 w-3" />
              {detectedLabel} detected — provider auto-set!
            </span>
          )}
          {!isDetecting && !detectedLabel && !isApiKeyEmpty() && (
            <span className="text-xs text-yellow-500">
              Provider detect nahi hua — neeche manually select karo
            </span>
          )}
        </div>
      </div>

      {/* STEP 2: PROVIDER (auto-set hoga, manual override bhi) */}
      <div className="space-y-2">
        <Header
          title="AI Provider"
          description="API key paste karne par auto-select hoga. Manually bhi change kar sakte ho."
        />
        <Selection
          selected={selectedAIProvider?.provider}
          options={allAiProviders?.map((provider) => {
            const json = curl2Json(provider?.curl);
            return {
              label: provider?.isCustom
                ? json?.url || "Custom Provider"
                : provider?.id || "Custom Provider",
              value: provider?.id || "Custom Provider",
              isCustom: provider?.isCustom,
            };
          })}
          placeholder="Provider choose karo (ya API key paste karo)"
          onChange={(value) => {
            onSetSelectedAIProvider({
              provider: value,
              variables: {
                ...(getApiKeyValue() ? { api_key: getApiKeyValue() } : {}),
              },
            });
          }}
        />
        {localSelectedProvider && (
          <p className="text-xs text-muted-foreground">
            Endpoint: {localSelectedProvider?.url || "—"}
          </p>
        )}
      </div>

      {/* OTHER VARIABLES */}
      <div className="space-y-4">
        {variables
          .filter((variable) => variable.key !== "api_key")
          .map((variable) => {
            const getVariableValue = () => {
              if (!variable?.key || !selectedAIProvider?.variables) return "";
              return selectedAIProvider.variables[variable.key] || "";
            };

            return (
              <div className="space-y-1" key={variable?.key}>
                <Header
                  title={variable?.value || ""}
                  description={`${variable?.key?.replace(/_/g, " ")} configure karo`}
                />
                <TextInput
                  placeholder={`Enter ${variable?.key?.replace(/_/g, " ") || "value"}`}
                  value={getVariableValue()}
                  onChange={(value) => {
                    if (!variable?.key || !selectedAIProvider) return;
                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [variable.key]: value,
                      },
                    });
                  }}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
};