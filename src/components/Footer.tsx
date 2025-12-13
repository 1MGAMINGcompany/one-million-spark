import { useTranslation } from "react-i18next";

const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className="w-full py-6 mt-auto">
      <div className="flex flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium text-primary/60 tracking-wide">
          {t("footer.company")}
        </p>
        <p className="text-xs text-primary/40 tracking-[0.2em] uppercase">
          {t("footer.tagline")}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
