import { Button } from "@/components";
import { Lightbulb, Loader2 } from "lucide-react";

interface ChatAutoSuggestProps {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const ChatAutoSuggest = ({ onClick, isLoading, disabled }: ChatAutoSuggestProps) => {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8 rounded-lg text-orange-500 hover:bg-orange-500/10"
      title="Get AI Suggestion"
      onClick={onClick}
      disabled={isLoading || disabled}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Lightbulb className="size-4" />
      )}
    </Button>
  );
};