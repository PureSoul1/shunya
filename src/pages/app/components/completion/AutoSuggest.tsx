import { useState } from "react";
import { Button } from "@/components";
import { Lightbulb, Loader2 } from "lucide-react";
import { fetchAIResponse, shouldUseShunyaAPI } from "@/lib";
import { useApp } from "@/contexts";
import { AUTO_SUGGESTION_PROMPT } from "@/config";
import { UseCompletionReturn } from "@/types";

interface AutoSuggestProps extends UseCompletionReturn {}

export const AutoSuggest = ({ 
  setInput, 
  inputRef, 
  conversationHistory, 
  isLoading 
}: AutoSuggestProps) => {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const { selectedAIProvider, allAiProviders } = useApp();

  const handleGetSuggestion = async () => {
    setIsSuggesting(true);
    try {
      const useShunyaAPI = await shouldUseShunyaAPI();
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      
      if (!provider && !useShunyaAPI) {
        setIsSuggesting(false);
        return;
      }

      const context = conversationHistory?.slice(-5).map((m: any) => m.content).join(" ") || "General conversation";
      let fullResponse = "";

      for await (const chunk of fetchAIResponse({
        provider: useShunyaAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: AUTO_SUGGESTION_PROMPT,
        history: [],
        userMessage: `Current meeting context:\n${context}`,
        imagesBase64: [],
        signal: new AbortController().signal,
      })) {
        fullResponse += chunk;
      }
      
      if (fullResponse) {
        // Suggestion ko seedha Input box mein daal do (Best UX for overlay!)
        setInput(fullResponse);
        setTimeout(() => inputRef?.current?.focus(), 100);
      }
    } catch (e) {
      console.error("AutoSuggest error:", e);
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8 cursor-pointer text-orange-500 hover:bg-orange-500/10"
      title="Get AI Suggestion"
      onClick={handleGetSuggestion}
      disabled={isSuggesting || isLoading}
    >
      {isSuggesting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Lightbulb className="size-4" />
      )}
    </Button>
  );
};