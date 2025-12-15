import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";

const Support = () => {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card className="bg-background/80 border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-cinzel text-primary text-center">
            {t("support.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-foreground/80 text-center">
            {t("support.description")}
          </p>
          
          <div className="flex flex-col items-center gap-4 py-6">
            <Mail className="w-12 h-12 text-primary" />
            <a 
              href="mailto:1mgaming@proton.me" 
              className="text-xl text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              1mgaming@proton.me
            </a>
          </div>

          <div className="text-center text-foreground/60 text-sm space-y-2">
            <p>{t("support.responseTime")}</p>
            <p>{t("support.urgentNote")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Support;