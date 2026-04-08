import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ShieldAlert, Globe, Mail, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPPORTED_REGIONS = [
  "US (most states)",
  "United Kingdom",
  "EU",
  "Canada",
  "Australia",
  "Japan",
  "Brazil",
];

interface GeoBlockScreenProps {
  wallet?: string;
  onDismiss: () => void;
  onExploreReadOnly: () => void;
}

export default function GeoBlockScreen({ wallet, onDismiss, onExploreReadOnly }: GeoBlockScreenProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);

  const detectedRegion = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";

  const handleJoinWaitlist = async () => {
    if (!email || !email.includes("@")) {
      toast.error(t("geoBlock.invalidEmail"));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("geo_waitlist").insert({
        email,
        wallet: wallet || null,
        detected_region: detectedRegion,
      });
      if (error) throw error;
      setJoined(true);
      toast.success(t("geoBlock.joinedSuccess"));
    } catch {
      toast.error(t("geoBlock.joinFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="relative border-destructive/30 bg-card/95 backdrop-blur-md overflow-hidden">
      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-secondary transition-colors z-10"
        aria-label="Close"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 shrink-0">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground font-['Cinzel']">
              {t("geoBlock.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("geoBlock.subtitle")}
            </p>
          </div>
        </div>

        {/* Supported Regions */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              {t("geoBlock.availableIn")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_REGIONS.map((region) => (
              <Badge
                key={region}
                variant="secondary"
                className="text-xs px-2.5 py-1"
              >
                {region}
              </Badge>
            ))}
          </div>
        </div>

        {/* Waitlist */}
        <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">{t("geoBlock.joinWaitlist")}</span>
          </div>
          {joined ? (
            <p className="text-sm text-green-400 font-medium">
              ✅ {t("geoBlock.onTheList")}
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder={t("geoBlock.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 h-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleJoinWaitlist()}
              />
              <Button
                size="sm"
                onClick={handleJoinWaitlist}
                disabled={submitting}
                className="shrink-0"
              >
                {submitting ? t("geoBlock.joining") : t("geoBlock.join")}
              </Button>
            </div>
          )}
        </div>

        {/* Explore Read-Only */}
        <Button
          variant="outline"
          className="w-full"
          onClick={onExploreReadOnly}
        >
          <Eye className="w-4 h-4 mr-2" />
          {t("geoBlock.exploreReadOnly")}
        </Button>

        {/* VPN notice — legally framed */}
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          {t("geoBlock.vpnNotice")}
        </p>
      </div>
    </Card>
  );
}
