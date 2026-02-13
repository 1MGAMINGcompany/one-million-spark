import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BUILD_VERSION } from "@/lib/buildVersion";

const Footer = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { to: "/game-rules", labelKey: "footer.gameRules" },
    { to: "/terms-of-service", labelKey: "footer.termsOfService" },
    { to: "/support", labelKey: "footer.support" },
    { to: "/privacy-policy", labelKey: "footer.privacyPolicy" },
    { to: "/help", labelKey: "footer.helpGuides" },
  ];

  return (
    <footer className="w-full py-6 mt-auto">
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-xs text-primary/50">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="hover:text-primary/80 transition-colors"
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </div>

        {/* Mobile collapsible */}
        <div className="md:hidden w-full px-4">
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex items-center justify-center gap-1 text-xs text-primary/50 mx-auto">
              <span>{t('footer.legalAndSupport')}</span>
              <ChevronUp
                className={`w-3 h-3 transition-transform ${isOpen ? "" : "rotate-180"}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="flex flex-col items-center gap-2 text-xs text-primary/50">
                {links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="hover:text-primary/80 transition-colors"
                  >
                    {t(link.labelKey)}
                  </Link>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Company branding */}
        <p className="text-sm font-medium text-primary/60 tracking-wide">
          {t("footer.company")}
        </p>
        <p className="text-xs text-primary/40 tracking-[0.2em] uppercase">
          {t("footer.tagline")}
        </p>
        <p className="text-[10px] text-muted-foreground/40 mt-2 font-mono">
          {BUILD_VERSION}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
