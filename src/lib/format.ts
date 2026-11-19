export function hours(seconds: number): string {
  const t = Math.floor(Math.max(0, seconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${p(m)}min ${p(sec)}s` : `${m}min ${p(sec)}s`;
}
export function percent(elapsed: number, total: number): number { return total > 0 ? Math.min(100, Math.floor((elapsed / total) * 1000) / 10) : 0; }
export function minutes(value?: number): string {
  if (value === undefined) return "—";
  const t = Math.max(0, Math.round(value * 60));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${p(m)}min ${p(sec)}s` : `${m}min ${p(sec)}s`;
}
export function timeAgo(value: string): string { const difference = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000)); return difference < 1 ? "Agora" : difference < 60 ? `Há ${difference} min` : `Há ${Math.floor(difference / 60)}h`; }