/**
 * Format an event date string into a localized date + time + timezone.
 * e.g. "Mar 15, 2:00 PM EDT"
 */
export function formatEventDateTime(eventDate: string): string {
  return new Date(eventDate).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Format an event date string into a localized time + timezone only.
 * e.g. "2:00 PM EDT"
 */
export function formatEventTime(eventDate: string): string {
  return new Date(eventDate).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
