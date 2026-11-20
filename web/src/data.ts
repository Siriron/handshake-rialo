import type { DealRead } from "./lib/rialo/chain";

export type Face = "rule" | "verified" | "open" | "deal";
export interface Item {
  id: string; title: string; category: string; meta: string; description: string; tags: string[]; face: Face;
  address?: string; // for deal cards
  live?: DealRead | null;
}
const R = (id: string, title: string, category: string, description: string, tags = ["Rialo devnet", "Venus program"]): Item =>
  ({ id, title, category, meta: "Devnet", description, tags, face: "rule" });

/** Facts from the repository, its README and its recorded devnet runs. */
export const RULES: Item[] = [
  R("escrow", "Milestone escrow", "Escrow", "A buyer funds up to four milestones. Each one is paid to the seller or refunded to the buyer at its own deadline."),
  R("keeper", "No keeper", "Automation", "After funding nobody has to press a button. The program drives every deadline itself."),
  R("heartbeat", "Heartbeat", "Automation", "A ten second heartbeat wakes the program, so deadlines are acted on without an outside bot."),
  R("rex", "Validator evidence", "Evidence", "At each deadline Rialo validators fetch the GitHub evidence through REX and report it back to the program."),
  R("release", "Release evidence", "Evidence", "A published release, written owner/repo@tag, shows that the work shipped.", ["GitHub release", "owner/repo@tag"]),
  R("pr", "Pull request evidence", "Evidence", "A merged pull request, written owner/repo#number, shows that the change landed.", ["GitHub PR", "owner/repo#number"]),
  R("approve", "Early approval", "Buyer", "The buyer can approve a milestone before its deadline and the seller is paid straight away."),
  R("refund", "Refund on a miss", "Buyer", "If the evidence is missing at the deadline, the milestone is refunded to the buyer."),
  R("address", "Buyer-only address", "Safety", "A deal lives at an address derived from the buyer's key and a random slug, so only the buyer can address it."),
  R("limits", "Limits", "Rules", "Each milestone is at least 0.01 RLO. Deadlines are 60 seconds to 24 hours ahead and 30 seconds apart. A check gets three attempts."),
  R("kelvin", "Kelvin", "Units", "Amounts are counted in kelvin. One RLO is one billion kelvin."),
  R("rust", "Pinned toolchain", "Build", "The program builds with Rust 1.90.0. Newer Rust breaks REX on validators because of a WASI version mismatch."),
  { id: "v-scn", title: "Six live scenarios", category: "Verified", meta: "Devnet", face: "verified", tags: ["Ran on devnet", "All passed"],
    description: "The full regression ran six scenarios end to end on Rialo devnet, and all six passed." },
  { id: "v-core", title: "Core logic tests", category: "Verified", meta: "CI", face: "verified", tags: ["23 tests", "Pure Rust"],
    description: "The settlement rules live in a pure Rust crate with 23 tests that run on every push." },
  { id: "v-web", title: "This site, end to end", category: "Verified", meta: "Devnet", face: "verified", tags: ["Same code as the browser", "Recorded run"],
    description: "A recorded run used this site's own chain code to create, fund, approve, pay and refund a deal on devnet." },
  { id: "o-direct", title: "Direct handler calls", category: "Not shown", meta: "Open", face: "open", tags: ["Unverified"],
    description: "Calling the handler functions directly with raw transactions has not been shown on chain." },
  { id: "o-report", title: "Forged report", category: "Not shown", meta: "Open", face: "open", tags: ["Unverified"],
    description: "A forged verifier report argument submitted on chain has not been tested." },
  { id: "o-stuck", title: "Stuck check rescue", category: "Not shown", meta: "Open", face: "open", tags: ["Unverified"],
    description: "The rescue path for a stuck check, and the drained fee wallet case, have not been shown on chain." },
];

/** Deals from recorded devnet runs, read live from chain. */
export const VERIFIED_DEALS = [
  { address: "7XfpdxLcQAhACH14epmavkcoeXCHjsprAiJouACEgXiv", label: "Probe run" },
  { address: "G9QMxLy6DTQD5GgEg4oR2ij83vVDuQMMPNdHACiwBrKm", label: "End to end run" },
];
export const dealItem = (address: string, label: string, live: DealRead | null = null): Item => ({
  id: `deal-${address}`, title: `Deal ${address.slice(0, 4)}…${address.slice(-4)}`, category: label, meta: "Devnet", face: "deal", address, live,
  tags: ["Live from chain", "Open the deal"],
  description: "Read from Rialo devnet. Open it to see each milestone, its evidence and its state.",
});
