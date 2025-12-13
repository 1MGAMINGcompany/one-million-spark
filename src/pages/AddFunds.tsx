import { useTranslation } from "react-i18next";
import { Wallet, ArrowRightLeft, Send } from "lucide-react";

const AddFunds = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            {t("addFunds.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("addFunds.subtitle")}
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
                  {t("addFunds.step1Title")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("addFunds.step1Desc")}
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
                  {t("addFunds.step2Title")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("addFunds.step2Desc")}
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
                  {t("addFunds.step3Title")}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t("addFunds.step3Desc")}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AddFunds;
