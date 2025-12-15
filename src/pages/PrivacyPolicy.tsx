import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PrivacyPolicy = () => {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="bg-background/80 border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-cinzel text-primary text-center">
            {t("privacy.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-invert max-w-none space-y-6 text-foreground/80">
          <p className="text-sm text-foreground/60">{t("privacy.lastUpdated")}</p>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section1Title")}</h2>
            <p>{t("privacy.section1Text")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section2Title")}</h2>
            <p>{t("privacy.section2Text")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section3Title")}</h2>
            <p>{t("privacy.section3Text")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section4Title")}</h2>
            <p>{t("privacy.section4Text")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section5Title")}</h2>
            <p>{t("privacy.section5Text")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section6Title")}</h2>
            <p>{t("privacy.section6Text")}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.section7Title")}</h2>
            <p>
              {t("privacy.section7Text")}{" "}
              <a href="mailto:1mgaming@proton.me" className="text-primary hover:underline">
                1mgaming@proton.me
              </a>
            </p>
          </section>

          <section className="border-t border-primary/20 pt-6 mt-6">
            <h2 className="text-xl font-semibold text-primary mb-2">{t("privacy.disclaimerTitle")}</h2>
            <p className="font-medium">{t("privacy.disclaimerText")}</p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyPolicy;