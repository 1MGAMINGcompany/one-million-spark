import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Wallet, Coins, Swords } from "lucide-react";

const LS_KEY = "intro_seen";

interface WelcomeIntroModalProps {
  isAuthenticated: boolean;
}

export function WelcomeIntroModal({ isAuthenticated }: WelcomeIntroModalProps) {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const seen = localStorage.getItem(LS_KEY);
    if (!seen) {
      // Small delay so login UI settles first
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [isAuthenticated]);

  const handleDismiss = () => {
    if (dontShow) {
      localStorage.setItem(LS_KEY, "true");
    }
    setOpen(false);
  };

  const steps = [
    { icon: Wallet, label: "Wallet ready", desc: "Your wallet was created automatically." },
    { icon: Coins, label: "Add SOL", desc: "Fund your wallet to enter matches." },
    { icon: Swords, label: "Join a match", desc: "Play chess, backgammon, dominos & more." },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-display">
            Welcome to{" "}
            <span className="text-primary">1M Gaming</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                <step.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {i + 1}. {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          <Button variant="gold" className="w-full" onClick={handleDismiss}>
            Got it
          </Button>
          <label className="flex items-center gap-2 cursor-pointer justify-center">
            <Checkbox
              checked={dontShow}
              onCheckedChange={(v) => setDontShow(!!v)}
              className="border-muted-foreground/40"
            />
            <span className="text-xs text-muted-foreground select-none">
              Don't show again
            </span>
          </label>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
