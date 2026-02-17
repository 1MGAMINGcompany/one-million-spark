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
import { useTranslation } from "react-i18next";

const LS_KEY = "intro_seen";

interface WelcomeIntroModalProps {
  isAuthenticated: boolean;
}

export function WelcomeIntroModal({ isAuthenticated }: WelcomeIntroModalProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const seen = localStorage.getItem(LS_KEY);
    if (!seen) {
      const timer = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  const handleDismiss = () => {
    if (dontShow) {
      localStorage.setItem(LS_KEY, "true");
    }
    setOpen(false);
  };

  const steps = [
    { icon: Wallet, label: t("welcomeIntro.walletReady"), desc: t("welcomeIntro.walletReadyDesc") },
    { icon: Coins, label: t("welcomeIntro.addSol"), desc: t("welcomeIntro.addSolDesc") },
    { icon: Swords, label: t("welcomeIntro.joinMatch"), desc: t("welcomeIntro.joinMatchDesc") },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-display">
            {t("welcomeIntro.title")}{" "}
            <span className="text-primary">{t("welcomeIntro.brand")}</span>
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
            {t("welcomeIntro.gotIt")}
          </Button>
          <label className="flex items-center gap-2 cursor-pointer justify-center">
            <Checkbox
              checked={dontShow}
              onCheckedChange={(v) => setDontShow(!!v)}
              className="border-muted-foreground/40"
            />
            <span className="text-xs text-muted-foreground select-none">
              {t("welcomeIntro.dontShowAgain")}
            </span>
          </label>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
