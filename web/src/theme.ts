export type Mode = "auto" | "day" | "night";
export type Resolved = "dark" | "light";
const KEY = "handshake.theme.v1";

export interface Palette {
  bg: string; ink: string; mute: string; cardA: string; cardB: string; faint: string; edge: string;
  paid: string; refunded: string; funded: string; chipTint: number; skeleton: number; dark: boolean;
}
export const PAL: Record<Resolved, Palette> = {
  dark: { bg: "#0c0c0d", ink: "#ededeb", mute: "#8a8a88", cardA: "#19191b", cardB: "#111113", faint: "#1b1b1d", edge: "#8a8a88", paid: "#8fcfa0", refunded: "#e3b567", funded: "#8fa0ff", chipTint: 0.05, skeleton: 0.085, dark: true },
  light: { bg: "#e5e5e2", ink: "#141415", mute: "#55554f", cardA: "#ffffff", cardB: "#f4f4f1", faint: "#d4d4d0", edge: "#6c6c69", paid: "#1f7a3d", refunded: "#96620a", funded: "#3d4fd6", chipTint: 0.93, skeleton: 0.8, dark: false },
};

export let mode: Mode = "auto";
export let resolved: Resolved = "dark";
export const pal = (): Palette => PAL[resolved];
const subs = new Set<() => void>();
export const onTheme = (f: () => void) => (subs.add(f), () => { subs.delete(f); });
const mq = matchMedia("(prefers-color-scheme: light)");

function apply(notify: boolean) {
  const next: Resolved = mode === "day" ? "light" : mode === "night" ? "dark" : mq.matches ? "light" : "dark";
  const changed = next !== resolved;
  resolved = next;
  const root = document.documentElement;
  root.dataset.theme = resolved; root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", PAL[resolved].bg);
  if (notify && changed) subs.forEach((f) => f());
}
export function initTheme() {
  try { const m = localStorage.getItem(KEY); if (m === "auto" || m === "day" || m === "night") mode = m; } catch { /* default */ }
  apply(false);
  mq.addEventListener("change", () => { if (mode === "auto") apply(true); });
}
export function setMode(m: Mode) {
  mode = m; try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  apply(false); subs.forEach((f) => f()); // one notification, also when only the mode label changes
}
