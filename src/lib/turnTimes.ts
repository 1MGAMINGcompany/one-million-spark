export const TURN_TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 0, label: "∞" },
];

export function formatTurnTimeShort(seconds: number | null | undefined): string {
  if (seconds === 0) return "∞";
  if (!seconds) return "60s";
  return `${seconds}s`;
}
