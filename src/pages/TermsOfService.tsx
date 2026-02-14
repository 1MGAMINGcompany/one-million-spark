import { useTranslation } from "react-i18next";
import { Shield, Coins, Zap, Scale, Link2, UserCheck } from "lucide-react";
import { useSeoMeta } from "@/components/seo/SeoMeta";

const TermsOfService = () => {
  const { t } = useTranslation();

  useSeoMeta({
    title: "1MGAMING Terms of Service – Skill-Based Gaming Platform",
    description:
      "Official terms governing use of the 1MGAMING skill-based competitive gaming platform.",
  });

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 text-center">
          Terms of Service – 1MGAMING
        </h1>
        <p className="text-muted-foreground text-center mb-10">
          {t("terms.lastUpdated")}
        </p>

        <div className="space-y-8">
          {/* A. Nature of Platform */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Shield className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  A. Nature of Platform
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  1MGAMING provides a decentralized, skill-based gaming platform
                  where users compete against other users. Outcomes are
                  determined by player skill and strategy. No random number
                  generators are used to determine winners.
                </p>
              </div>
            </div>
          </section>

          {/* B. Not Gambling */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Coins className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  B. Skill-Based Competition
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  1MGAMING does not operate as a gambling platform, a platform
                  for games of chance, or a casino. Entry fees represent
                  competitive participation fees for skill-based contests.
                </p>
              </div>
            </div>
          </section>

          {/* C. User Responsibility */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Scale className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  C. User Responsibility
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Users are solely responsible for determining whether
                  participation in skill-based contests for digital assets is
                  permitted under their local laws. By using the platform, users
                  represent that they are legally allowed to participate.
                </p>
              </div>
            </div>
          </section>

          {/* D. Age Requirement */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <UserCheck className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  D. Age Requirement
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Users must be at least 18 years old or the age of majority in
                  their jurisdiction.
                </p>
              </div>
            </div>
          </section>

          {/* E. Blockchain Transparency */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Link2 className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  E. Blockchain Transparency
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Game outcomes and settlements occur on the Solana blockchain
                  and are publicly verifiable.
                </p>
              </div>
            </div>
          </section>

          {/* Gas Fees */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Zap className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {t("terms.gasFeesTitle")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("terms.gasFeesText")}
                </p>
              </div>
            </div>
          </section>

          {/* Important Notice */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center">
            <p className="text-foreground font-semibold text-lg mb-2">
              {t("terms.noticeTitle")}
            </p>
            <p className="text-muted-foreground">
              {t("terms.noticeText")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
