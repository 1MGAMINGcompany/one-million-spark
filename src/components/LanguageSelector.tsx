import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import { languages, type LanguageCode } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  // Match exact code first, then base code (e.g. "hi-IN" → "hi")
  const currentLang =
    languages.find(l => l.code === i18n.language) ||
    languages.find(l => i18n.language.startsWith(l.code)) ||
    languages[0];

  const handleLanguageChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    // Update document direction for RTL languages
    const lang = languages.find(l => l.code === code);
    document.documentElement.dir = lang?.dir || 'ltr';
    document.documentElement.lang = code;
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-200 text-primary hover:text-primary/80 hover:bg-secondary"
          aria-label="Select language"
        >
          <Globe size={16} />
          <span className="text-[11px] font-semibold tracking-wide uppercase leading-none">
            {currentLang.code.toUpperCase()}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-card border-border">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className={lang.dir === 'rtl' ? 'font-arabic' : ''}>
              {lang.nativeName}
            </span>
            {i18n.language === lang.code && (
              <Check size={16} className="text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSelector;
