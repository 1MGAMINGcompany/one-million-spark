import { detectDomain } from "@/lib/domainDetection";

export function getBrandName(): string {
  const domain = detectDomain();
  return domain.type === "platform" || domain.type === "operator"
    ? "1MG.live"
    : "1M Gaming";
}
