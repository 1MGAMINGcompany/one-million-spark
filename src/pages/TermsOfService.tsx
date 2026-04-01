import { useTranslation } from "react-i18next";
import { Shield, Coins, Zap, Scale, Eye, UserCheck } from "lucide-react";
import { useSeoMeta } from "@/components/seo/SeoMeta";

const TermsOfService = () => {
  const { t } = useTranslation();

  useSeoMeta({
    title: "1MGAMING Terms of Service – Skill-Based Gaming Platform",
    description:
      "Official terms governing use of the 1MGAMING skill-based competitive gaming platform.",
  });

  const sectionClass = "bg-white/5 border border-white/10 rounded-lg p-6";
  const iconWrapClass = "p-3 bg-blue-500/10 rounded-full shrink-0";
  const iconClass = "text-blue-400";
  const headingClass = "text-xl font-semibold text-white mb-3";
  const bodyClass = "text-white/60 leading-relaxed";

  return (
    <div className="min-h-screen bg-[#06080f] text-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 text-center">
          Terms of Service – 1MGAMING
        </h1>
        <p className="text-white/40 text-center mb-10">
          {t("terms.lastUpdated")}
        </p>

        <div className="space-y-8">
          <section className={sectionClass}>
            <div className="flex items-start gap-4">
              <div className={iconWrapClass}><Shield className={iconClass} size={24} /></div>
              <div>
                <h2 className={headingClass}>A. Nature of Platform</h2>
                <p className={bodyClass}>
                  1MGAMING provides a skill-based gaming and prediction market
                  platform where users compete against other users. Game outcomes
                  are determined by player skill and strategy. No random number
                  generators are used to determine winners. Prediction markets
                  allow users to trade on the outcomes of real-world events.
                </p>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-start gap-4">
              <div className={iconWrapClass}><Coins className={iconClass} size={24} /></div>
              <div>
                <h2 className={headingClass}>B. Skill-Based Competition</h2>
                <p className={bodyClass}>
                  1MGAMING does not operate as a gambling platform, a platform
                  for games of chance, or a casino. Entry fees represent
                  competitive participation fees for skill-based contests.
                  Prediction markets are information-driven tools, not games of
                  chance.
                </p>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-start gap-4">
              <div className={iconWrapClass}><Scale className={iconClass} size={24} /></div>
              <div>
                <h2 className={headingClass}>C. User Responsibility</h2>
                <p className={bodyClass}>
                  Users are solely responsible for determining whether
                  participation in skill-based contests and prediction markets is
                  permitted under their local laws. By using the platform, users
                  represent that they are legally allowed to participate.
                </p>
                <p className={`${bodyClass} mt-3`}>
                  Users are solely responsible for ensuring that participation
                  in skill-based competitions and prediction markets is lawful
                  in their jurisdiction. 1MGAMING does not make representations
                  regarding the legality of participation in any specific
                  country, state, or territory.
                </p>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-start gap-4">
              <div className={iconWrapClass}><UserCheck className={iconClass} size={24} /></div>
              <div>
                <h2 className={headingClass}>D. Age Requirement</h2>
                <p className={bodyClass}>
                  Users must be at least 18 years old or the age of majority in
                  their jurisdiction.
                </p>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-start gap-4">
              <div className={iconWrapClass}><Eye className={iconClass} size={24} /></div>
              <div>
                <h2 className={headingClass}>E. Platform Transparency</h2>
                <p className={bodyClass}>
                  Game outcomes and settlements are verifiable and auditable.
                  All transactions are recorded transparently and can be
                  independently verified.
                </p>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-start gap-4">
              <div className={iconWrapClass}><Zap className={iconClass} size={24} /></div>
              <div>
                <h2 className={headingClass}>{t("terms.gasFeesTitle")}</h2>
                <p className={bodyClass}>{t("terms.gasFeesText")}</p>
              </div>
            </div>
          </section>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-6 text-center">
            <p className="text-white font-semibold text-lg mb-2">
              {t("terms.noticeTitle")}
            </p>
            <p className="text-white/50">
              {t("terms.noticeText")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
