import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const PLATFORM_LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" },
  { code: "fr", label: "FR" },
  { code: "hi", label: "HI" },
  { code: "de", label: "DE" },
  { code: "ar", label: "AR" },
  { code: "it", label: "IT" },
  { code: "ja", label: "JA" },
  { code: "zh", label: "ZH" },
] as const;

export default function PlatformLanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const current = PLATFORM_LANGS.find(l => i18n.language.startsWith(l.code)) || PLATFORM_LANGS[0];

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("1m-gaming-language", code);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm"
        aria-label="Select language"
      >
        <Globe size={14} />
        <span className="font-semibold text-xs">{current.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed sm:absolute right-2 sm:right-0 top-auto sm:top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl overflow-hidden min-w-[100px] max-h-64 overflow-y-auto">
            {PLATFORM_LANGS.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleChange(lang.code)}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors ${
                  current.code === lang.code ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
