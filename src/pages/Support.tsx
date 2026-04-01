import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";

const Support = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <h1 className="text-3xl font-bold text-blue-400 text-center mb-6">
            {t("support.title")}
          </h1>
          <p className="text-white/60 text-center">
            {t("support.description")}
          </p>

          <div className="flex flex-col items-center gap-4 py-8">
            <Mail className="w-12 h-12 text-blue-400" />
            <a
              href="mailto:1mgaming@proton.me"
              className="text-xl text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
            >
              1mgaming@proton.me
            </a>
          </div>

          <div className="text-center text-white/40 text-sm space-y-2">
            <p>{t("support.responseTime")}</p>
            <p>{t("support.urgentNote")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
