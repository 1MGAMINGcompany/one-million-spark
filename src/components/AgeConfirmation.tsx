import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const AGE_CONFIRMED_KEY = "1m-gaming-age-confirmed";

const AgeConfirmation = () => {
  const { t } = useTranslation();
  // DISABLED FOR TESTING - set to false to skip age verification
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Temporarily disabled for testing - uncomment before deploy
    // const confirmed = localStorage.getItem(AGE_CONFIRMED_KEY);
    // if (!confirmed) {
    //   setShowModal(true);
    // }
  }, []);

  const handleConfirm = () => {
    localStorage.setItem(AGE_CONFIRMED_KEY, "true");
    setShowModal(false);
  };

  const handleExit = () => {
    window.location.href = "https://www.google.com";
  };

  return (
    <Dialog open={showModal} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md border-primary/30 bg-background/95 backdrop-blur-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-cinzel text-primary text-center">
            {t("ageConfirmation.title")}
          </DialogTitle>
          <DialogDescription className="text-center text-foreground/70 pt-4 text-base">
            {t("ageConfirmation.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {t("ageConfirmation.confirm")}
          </Button>
          <Button
            onClick={handleExit}
            variant="outline"
            className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            {t("ageConfirmation.exit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgeConfirmation;