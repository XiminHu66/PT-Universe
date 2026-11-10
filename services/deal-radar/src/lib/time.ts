const BEIJING = "Asia/Shanghai";
const PACIFIC = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "America/Los_Angeles",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatPacific(ms: number | null): string | null {
  return ms !== null && Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? PACIFIC.format(ms) : null;
}

/** Format an instant as Beijing time `YYYY-MM-DD HH:mm` (24-hour). */
export function formatBeijing(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}
