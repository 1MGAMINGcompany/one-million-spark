import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PlatformPrivacyPolicy() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#06080f] text-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors mb-8"
        >
          <ArrowLeft size={16} /> {t("legal.backToHome")}
        </button>

        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          {t("legal.privacy.title")}
        </h1>
        <p className="text-white/40 text-sm mb-10">{t("legal.lastUpdated")}</p>

        <div className="space-y-8">
          <Section title={t("legal.privacy.s1Title")} body={t("legal.privacy.s1Body")} />
          <Section title={t("legal.privacy.s2Title")} body={t("legal.privacy.s2Body")} />
          <Section title={t("legal.privacy.s3Title")} body={t("legal.privacy.s3Body")} />
          <Section title={t("legal.privacy.s4Title")} body={t("legal.privacy.s4Body")} />
          <Section title={t("legal.privacy.s5Title")} body={t("legal.privacy.s5Body")} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="bg-white/5 border border-white/10 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-3">{title}</h2>
      <p className="text-white/60 leading-relaxed">{body}</p>
    </section>
  );
}
