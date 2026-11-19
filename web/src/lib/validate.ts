import { PublicKey } from "@rialo/ts-cdk";
import { KIND, MAX_MILESTONES, MAX_WINDOW_MS, MIN_AMOUNT_KELVIN, MIN_GAP_MS, MIN_WINDOW_MS, TARGET_WIDTH } from "./rialo/config";
import { parseRlo } from "./format";

export interface Draft {
  amount: string;
  minutes: string;
  kind: "release" | "pr";
  target: string;
}
export interface DraftError { field: keyof Draft; message: string }

/** Margin so the deadline is still at least the 60 s minimum when its transaction lands. */
export const SEND_MARGIN_MS = 45_000;

export function validateTarget(kind: Draft["kind"], t: string): string | null {
  if (new TextEncoder().encode(t).length > TARGET_WIDTH) return `Keep it under ${TARGET_WIDTH} characters.`;
  if (kind === "release") return /^[\w.-]+\/[\w.-]+@[^\s@]+$/.test(t) ? null : "Use owner/repo@tag, for example acme/site@v1.0.0.";
  return /^[\w.-]+\/[\w.-]+#[1-9]\d*$/.test(t) ? null : "Use owner/repo#number, for example acme/site#42.";
}

export function validateDraft(seller: string, buyer: string | null, drafts: Draft[]): DraftError[][] & { seller?: string } {
  const out: DraftError[][] & { seller?: string } = drafts.map(() => []);
  try {
    PublicKey.fromString(seller.trim());
    if (buyer && seller.trim() === buyer) out.seller = "The seller must be a different address from your wallet.";
  } catch {
    out.seller = "Enter the seller's Rialo address.";
  }
  if (drafts.length < 1 || drafts.length > MAX_MILESTONES) out.seller ??= `A deal needs 1 to ${MAX_MILESTONES} milestones.`;
  let prev = 0;
  drafts.forEach((d, i) => {
    const e = out[i]!;
    const k = parseRlo(d.amount);
    if (k === null) e.push({ field: "amount", message: "Enter an amount in RLO, for example 0.5." });
    else if (k < MIN_AMOUNT_KELVIN) e.push({ field: "amount", message: "The minimum is 0.01 RLO per milestone." });
    const min = Number(d.minutes);
    const ms = min * 60_000;
    if (!Number.isInteger(min) || min <= 0) e.push({ field: "minutes", message: "Enter whole minutes." });
    else if (ms < MIN_WINDOW_MS + SEND_MARGIN_MS) e.push({ field: "minutes", message: "Allow at least 2 minutes." });
    else if (ms > MAX_WINDOW_MS - SEND_MARGIN_MS) e.push({ field: "minutes", message: "Deadlines can be at most 24 hours out." });
    else if (i > 0 && ms - prev < MIN_GAP_MS + 30_000) e.push({ field: "minutes", message: "Each deadline must be at least 1 minute after the one before." });
    if (Number.isInteger(min) && min > 0) prev = ms;
    const te = validateTarget(d.kind, d.target.trim());
    if (te) e.push({ field: "target", message: te });
  });
  return out;
}
export const kindValue = (k: Draft["kind"]) => (k === "release" ? KIND.release : KIND.pullRequest);
