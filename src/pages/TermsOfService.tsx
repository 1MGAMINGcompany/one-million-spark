import { useTranslation } from "react-i18next";
import { Shield, Coins, Zap, Scale } from "lucide-react";

const TermsOfService = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 text-center">
          {t("terms.title")}
        </h1>
        <p className="text-muted-foreground text-center mb-10">
          {t("terms.lastUpdated")}
        </p>

        <div className="space-y-8">
          {/* Skill-Based Games Section */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Shield className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {t("terms.skillBasedTitle")}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {t("terms.skillBasedText")}
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {t("terms.skillPoint1")}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {t("terms.skillPoint2")}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {t("terms.skillPoint3")}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Crypto Disclaimer Section */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Coins className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {t("terms.cryptoTitle")}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {t("terms.cryptoText")}
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {t("terms.cryptoPoint1")}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {t("terms.cryptoPoint2")}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {t("terms.cryptoPoint3")}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Gas Fees Section */}
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

          {/* Fair Play Section */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Scale className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {t("terms.fairPlayTitle")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("terms.fairPlayText")}
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
