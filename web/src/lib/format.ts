import { KELVIN_PER_RLO } from "./rialo/config";

export function fmtRlo(k: bigint, maxDp = 4): string {
  const whole = k / KELVIN_PER_RLO;
  const frac = (k % KELVIN_PER_RLO).toString().padStart(9, "0").slice(0, maxDp).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
/** Parses a decimal RLO string into kelvin; returns null if malformed or over 9 decimals. */
export function parseRlo(s: string): bigint | null {
  const m = /^(\d{1,9})(?:\.(\d{1,9}))?$/.exec(s.trim());
  if (!m) return null;
  return BigInt(m[1]!) * KELVIN_PER_RLO + BigInt((m[2] ?? "").padEnd(9, "0"));
}
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export function countdown(ms: number): string {
  if (ms <= 0) return "due now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
export function evidenceUrl(kind: bigint, target: string): string | null {
  if (kind === 1n) {
    const m = /^([\w.-]+\/[\w.-]+)@(.+)$/.exec(target);
    return m ? `https://github.com/${m[1]}/releases/tag/${encodeURIComponent(m[2]!)}` : null;
  }
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(target);
  return m ? `https://github.com/${m[1]}/pull/${m[2]}` : null;
}
