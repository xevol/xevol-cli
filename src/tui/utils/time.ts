export function formatTimeAgo(raw?: string): string {
  if (!raw) return "—";
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "—";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    if (date.getFullYear() === now.getFullYear()) {
      return `${month}-${day}`;
    }
    return `${date.getFullYear()}-${month}-${day}`;
  } catch {
    return "—";
  }
}
