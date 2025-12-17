import { useTranslation } from "react-i18next";
import { Wallet, ArrowRightLeft, Send, Info } from "lucide-react";

const AddFunds = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            {t("addFunds.titleSol")}
          </h1>
          <p className="text-muted-foreground">
            {t("addFunds.subtitleSol")}
          </p>
        </div>

        <div className="space-y-8">
          {/* Step 1 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Wallet className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {t("addFunds.step1TitleSol")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("addFunds.step1DescSol")}
                </p>
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <ArrowRightLeft className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {t("addFunds.step2TitleSol")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("addFunds.step2DescSol")}
                </p>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Send className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {t("addFunds.step3TitleSol")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("addFunds.step3DescSol")}
                </p>
              </div>
            </div>
          </section>

          {/* Important Disclaimer */}
          <section className="bg-primary/5 border border-primary/20 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Info className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {t("addFunds.disclaimerTitleSol")}
                </h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    {t("addFunds.disclaimerPoint1Sol")}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    {t("addFunds.disclaimerPoint2Sol")}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    {t("addFunds.disclaimerPoint3Sol")}
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AddFunds;
