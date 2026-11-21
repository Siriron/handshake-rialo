import { PublicKey } from "@rialo/ts-cdk";
import { addMilestoneIx, createIx, fundIx } from "./rialo/instructions";
import { dealAddress } from "./rialo/pda";
import { parseRlo } from "./format";
import { kindValue, type Draft } from "./validate";
import type { Instruction } from "@rialo/ts-cdk";

/** A throwaway devnet address that receives demo payouts. Nobody holds its key; test funds only. */
export const DEMO_SELLER = "BuUruu5dUTrUYbxWo9kbQLuTptEoGDvRpgcTPQRKBBQH";
/** Beyond milestone amounts, a deal costs about 0.024 RLO in fees and account rent (measured on devnet). */
export const OVERHEAD_KELVIN = 30_000_000n;

export interface Preset {
  id: string; name: string; blurb: string; milestones: Draft[];
  /** What each milestone must end as. Checked on devnet by the preset test run. */
  expect: ("paid" | "refunded")[];
  /** Milestones the buyer approves early instead of waiting. */
  approve?: number[];
  how: string;
}
const rel = "Siriron/handshake-rialo@v0.1.0", merged = "cli/cli#1", closed = "cli/cli#7";
export const PRESETS: Preset[] = [
  { id: "release", name: "Release ships, seller paid", blurb: "One milestone tied to a published release.", expect: ["paid"],
    milestones: [{ amount: "0.05", minutes: "3", kind: "release", target: rel }], how: "Wait about 3 minutes. The release exists, so the seller is paid." },
  { id: "unmerged", name: "Pull request never merged, buyer refunded", blurb: "One milestone tied to a closed, unmerged pull request.", expect: ["refunded"],
    milestones: [{ amount: "0.05", minutes: "3", kind: "pr", target: closed }], how: "Wait about 3 minutes. The pull request was closed without merging, so you are refunded." },
  { id: "two-paid", name: "Two milestones, both delivered", blurb: "A merged pull request, then a published release.", expect: ["paid", "paid"],
    milestones: [{ amount: "0.03", minutes: "3", kind: "pr", target: merged }, { amount: "0.04", minutes: "5", kind: "release", target: rel }], how: "Milestone 1 pays at about 3 minutes, milestone 2 at about 5." },
  { id: "mixed", name: "Mixed outcome", blurb: "One milestone delivered, one not.", expect: ["paid", "refunded"],
    milestones: [{ amount: "0.03", minutes: "3", kind: "pr", target: merged }, { amount: "0.03", minutes: "5", kind: "pr", target: closed }], how: "Milestone 1 pays at about 3 minutes. Milestone 2 refunds at about 5." },
  { id: "approve", name: "Approve early", blurb: "A long deadline that you cut short by approving.", expect: ["paid"], approve: [0],
    milestones: [{ amount: "0.05", minutes: "20", kind: "release", target: rel }], how: "Open the deal after funding and tap Approve now. The seller is paid at once." },
];
export const presetTotal = (p: Preset) => p.milestones.reduce((n, m) => n + (parseRlo(m.amount) ?? 0n), 0n);
export const presetNeeds = (p: Preset) => presetTotal(p) + OVERHEAD_KELVIN;

/** The exact steps the form runs. The UI and the devnet test both call this, so a preset test covers the real path. */
export function buildPlan(buyer: PublicKey, slug: Uint8Array, seller: PublicKey, drafts: Draft[], t0: number): [string, Instruction][] {
  return [
    ["Create the deal", createIx(buyer, slug, seller)],
    ...drafts.map((d, i): [string, Instruction] => [`Add milestone ${i + 1}`, addMilestoneIx(buyer, slug, parseRlo(d.amount)!, BigInt(t0 + Number(d.minutes) * 60_000), kindValue(d.kind), d.target.trim())]),
    ["Fund the deal", fundIx(buyer, slug)],
  ];
}
export const planAddress = (buyer: PublicKey, slug: Uint8Array) => dealAddress(buyer, slug).toString();
