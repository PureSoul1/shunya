import { GripVerticalIcon } from "lucide-react";
import { Button } from "@/components";

export const DragButton = () => {
  // SHUNYA: License check bypassed. Window is always draggable.
  // Popup aur "Shunya" ka reference hata diya gaya hai.

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`-ml-[2px] w-fit`}
      data-tauri-drag-region={true} // Hamesha true rahega taaki window drag ho sake
    >
      <GripVerticalIcon className="h-4 w-4" />
    </Button>
  );
};