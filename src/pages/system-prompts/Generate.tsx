import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Textarea,
} from "@/components";
// SHUNYA: SparklesIcon aur GetLicense import hata diya
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GenerateSystemPromptProps {
  onGenerate: (prompt: string, promptName: string) => void;
}

interface SystemPromptResponse {
  prompt_name: string;
  system_prompt: string;
}

export const GenerateSystemPrompt = ({
  onGenerate,
}: GenerateSystemPromptProps) => {
  // SHUNYA: License check hata diya, ab feature freely kaam karega
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleGenerate = async () => {
    if (!userPrompt.trim()) {
      setError("Please describe what you want");
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);

      const response = await invoke<SystemPromptResponse>(
        "create_system_prompt",
        {
          userPrompt: userPrompt.trim(),
        }
      );

      if (response.system_prompt && response.prompt_name) {
        onGenerate(response.system_prompt, response.prompt_name);
        setIsOpen(false);
        setUserPrompt("");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to generate prompt";
      setError(errorMessage);
      console.error("Error generating system prompt:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Generate with AI"
          size="sm"
          variant="outline"
          className="w-fit"
        >
          {/* SHUNYA: Purana Star hata kar Naya Orange 'S' Icon lagaya */}
          <div className="flex items-center justify-center bg-orange-600 text-white rounded-full h-4 w-4 text-[8px] font-bold mr-1">S</div>
          Generate with AI
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-96 p-4 border shadow-lg"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">Generate a system prompt</p>
            <p className="text-xs text-muted-foreground">
              Describe the AI behavior you want, and we'll generate a prompt for
              you.
            </p>
          </div>

          <Textarea
            placeholder="e.g., I want an AI that helps me with code reviews and focuses on best practices..."
            className="min-h-[100px] resize-none border-1 border-input/50 focus:border-primary/50 transition-colors"
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              setError(null);
            }}
            disabled={isGenerating}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* SHUNYA: License check hata kar direct generate button laga diya */}
          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!userPrompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="flex items-center justify-center bg-white text-orange-600 rounded-full h-4 w-4 text-[8px] font-bold mr-2 animate-pulse">S</div>
                Generating...
              </>
            ) : (
              <>
                <div className="flex items-center justify-center bg-white text-orange-600 rounded-full h-4 w-4 text-[8px] font-bold mr-2">S</div>
                Generate
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};