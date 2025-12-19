import { Volume2, VolumeX } from "lucide-react";
import { useSound } from "@/contexts/SoundContext";
import { cn } from "@/lib/utils";

interface SoundToggleProps {
  size?: "sm" | "md";
  className?: string;
}

export const SoundToggle = ({ size = "md", className }: SoundToggleProps) => {
  const { soundEnabled, toggleSound } = useSound();
  
  const iconSize = size === "sm" ? 14 : 18;
  
  return (
    <button
      onClick={toggleSound}
      className={cn(
        "flex items-center justify-center rounded-lg border transition-all duration-200",
        soundEnabled 
          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20" 
          : "border-muted-foreground/30 bg-muted/20 text-muted-foreground hover:bg-muted/30",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        className
      )}
      aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
    >
      {soundEnabled ? (
        <Volume2 size={iconSize} />
      ) : (
        <VolumeX size={iconSize} />
      )}
    </button>
  );
};
