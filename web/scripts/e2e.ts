// End-to-end run of the exact code the web app uses, against Rialo devnet.
// Covers: create, add_milestone x2, fund, early approve (pays the seller),
// and a deadline check on an unmerged PR (refunds the buyer).
import { Keypair, KeypairSigner, airdrop, balanceKelvin, makeClient, readDeal, sendIx } from "../src/lib/rialo/chain.ts";
import { addMilestoneIx, approveIx, createIx, fundIx } from "../src/lib/rialo/instructions.ts";
import { dealAddress, bytesToHex, randomSlug } from "../src/lib/rialo/pda.ts";
import { phaseName } from "../src/lib/rialo/decode.ts";
import { KIND } from "../src/lib/rialo/config.ts";

const RPC = process.env.RIALO_RPC ?? "http://devnet.rialo.io:4100";
const client = makeClient(RPC);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => (checks.push([name, ok]), log(ok ? "PASS" : "FAIL", name));

const buyerKp = Keypair.generate();
const sellerKp = Keypair.generate();
const buyer = new KeypairSigner(buyerKp);
const buyerPk = await buyer.getPublicKey();
const sellerPk = await new KeypairSigner(sellerKp).getPublicKey();
log("rpc", RPC, "buyer", buyerPk.toString(), "seller", sellerPk.toString());

for (let i = 0; i < 6; i++) {
  await airdrop(client, buyerPk.toString(), 1).catch((e) => log("airdrop retry:", String(e.message ?? e)));
  await sleep(3000);
  if ((await balanceKelvin(client, buyerPk.toString()).catch(() => 0n)) >= 500_000_000n) break;
}
const start = await balanceKelvin(client, buyerPk.toString());
check("buyer funded by faucet", start >= 500_000_000n);

const slug = randomSlug();
const addr = dealAddress(buyerPk, slug);
log("slug", bytesToHex(slug), "deal", addr.toString());
const A0 = 20_000_000n, A1 = 30_000_000n;
const d0 = BigInt(Date.now() + 100_000), d1 = d0 + 600_000n;

const steps: [string, () => Promise<string>][] = [
  ["create", () => sendIx(client, buyer, createIx(buyerPk, slug, sellerPk))],
  ["add_milestone 0 (unmerged PR)", () => sendIx(client, buyer, addMilestoneIx(buyerPk, slug, A0, d0, KIND.pullRequest, "cli/cli#7"))],
  ["add_milestone 1 (release)", () => sendIx(client, buyer, addMilestoneIx(buyerPk, slug, A1, d1, KIND.release, "Siriron/handshake-rialo@v0.1.0"))],
  ["fund", () => sendIx(client, buyer, fundIx(buyerPk, slug))],
];
for (const [name, run] of steps) {
  try { log(name, "->", await run()); check(name, true); } catch (e) { check(name, false); log(String((e as Error).message)); }
  await sleep(2500);
}
const funded = await readDeal(client, addr.toString());
check("deal readable and funded", !!funded && funded.deal.dealStatus === 1n && funded.deal.remaining === A0 + A1);

try { log("approve 1 ->", await sendIx(client, buyer, approveIx(buyerPk, slug, 1n))); check("approve", true); } catch (e) { check("approve", false); log(String((e as Error).message)); }

const deadline = Date.now() + 420_000;
let last = "";
while (Date.now() < deadline) {
  const r = await readDeal(client, addr.toString());
  const s = r ? r.deal.milestones.map((m) => phaseName(m.status)).join(",") : "missing";
  if (s !== last) log("milestones:", s), (last = s);
  if (r && r.deal.milestones[1]!.status === 3n && r.deal.milestones[0]!.status === 4n) break;
  await sleep(10_000);
}
const fin = await readDeal(client, addr.toString());
check("approved milestone paid", fin?.deal.milestones[1]?.status === 3n);
check("unmerged PR milestone refunded", fin?.deal.milestones[0]?.status === 4n);
check("deal fully settled", fin?.deal.remaining === 0n);
const sellerBal = await balanceKelvin(client, sellerPk.toString()).catch(() => 0n);
check("seller received exactly the approved amount", sellerBal === A1);
log("buyer balance", String(start), "->", String(await balanceKelvin(client, buyerPk.toString())));
const failed = checks.filter(([, ok]) => !ok);
console.log(failed.length ? `E2E FAILED: ${failed.map(([n]) => n).join("; ")}` : "E2E PASSED");
process.exit(failed.length ? 1 : 0);
