import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const PLATFORM_LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" },
  { code: "fr", label: "FR" },
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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm"
        aria-label="Select language"
      >
        <Globe size={14} />
        <span className="font-semibold text-xs">{current.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-[#0d1117] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[100px]">
            {PLATFORM_LANGS.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleChange(lang.code)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors ${
                  current.code === lang.code ? "text-blue-400 font-semibold" : "text-white/70"
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
