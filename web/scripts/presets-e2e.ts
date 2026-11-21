// Runs every demo preset on Rialo devnet through the same plan the form uses, then checks the end state.
import { Keypair, KeypairSigner, PublicKey, airdrop, balanceKelvin, makeClient, readDeal, sendIx } from "../src/lib/rialo/chain.ts";
import { approveIx } from "../src/lib/rialo/instructions.ts";
import { randomSlug } from "../src/lib/rialo/pda.ts";
import { phaseName } from "../src/lib/rialo/decode.ts";
import { DEMO_SELLER, PRESETS, buildPlan, planAddress, presetNeeds, presetTotal } from "../src/lib/presets.ts";
import { validateDraft } from "../src/lib/validate.ts";

const client = makeClient(process.env.RIALO_RPC ?? "http://devnet.rialo.io:4100");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const results: [string, boolean, string][] = [];
const seller = PublicKey.fromString(DEMO_SELLER);

async function fund(pk: PublicKey, need: bigint) {
  for (let i = 0; i < 8; i++) {
    await airdrop(client, pk.toString(), 1).catch((e) => log("airdrop retry:", String((e as Error).message ?? e)));
    await sleep(3000);
    if ((await balanceKelvin(client, pk.toString()).catch(() => 0n)) >= need) return true;
  }
  return false;
}
const sellerStart = await balanceKelvin(client, DEMO_SELLER).catch(() => 0n);
log("demo seller balance before:", String(sellerStart));

const runs = [];
for (const p of PRESETS) {
  const kp = Keypair.generate(), signer = new KeypairSigner(kp), pk = await signer.getPublicKey();
  const errs = validateDraft(DEMO_SELLER, pk.toString(), p.milestones);
  const valid = !errs.seller && errs.every((e) => e.length === 0);
  log(p.id, "frontend validation:", valid ? "ok" : JSON.stringify(errs));
  if (!valid) { results.push([p.id, false, "fails frontend validation"]); continue; }
  const funded = await fund(pk, presetNeeds(p));
  if (!funded) { results.push([p.id, false, "could not fund the test account"]); continue; }
  runs.push({ p, signer, pk });
}
await Promise.all(runs.map(async ({ p, signer, pk }) => {
  const tag = `[${p.id}]`;
  try {
    const slug = randomSlug(), address = planAddress(pk, slug);
    for (const [name, ix] of buildPlan(pk, slug, seller, p.milestones, Date.now())) { await sendIx(client, signer, ix); log(tag, name, "ok"); await sleep(2500); }
    for (const i of p.approve ?? []) { await sendIx(client, signer, approveIx(pk, slug, BigInt(i))); log(tag, "approved milestone", i + 1); }
    const want = p.expect, deadline = Date.now() + 9 * 60_000; let last = "";
    for (;;) {
      const r = await readDeal(client, address).catch(() => null);
      const now = r ? r.deal.milestones.map((m) => phaseName(m.status)) : [];
      const s = now.join(",");
      if (s !== last) { log(tag, "milestones:", s); last = s; }
      if (r && now.length === want.length && now.every((x, i) => x === want[i])) {
        results.push([p.id, r.deal.remaining === 0n, r.deal.remaining === 0n ? `ended as expected (${want.join(", ")}), nothing left held` : "ended as expected but funds are still held"]); return;
      }
      if (Date.now() > deadline) { results.push([p.id, false, `timed out at: ${s || "unreadable"} (wanted ${want.join(", ")})`]); return; }
      await sleep(8000);
    }
  } catch (e) { results.push([p.id, false, String((e as Error).message ?? e)]); }
}));
const paidTotal = runs.reduce((n, { p }) => n + p.milestones.reduce((a, m, i) => a + (p.expect[i] === "paid" ? BigInt(Math.round(Number(m.amount) * 1e9)) : 0n), 0n), 0n);
const sellerEnd = await balanceKelvin(client, DEMO_SELLER).catch(() => 0n);
log("demo seller received:", String(sellerEnd - sellerStart), "expected at least:", String(paidTotal), "(total funded", String(runs.reduce((n, { p }) => n + presetTotal(p), 0n)) + ")");
for (const [id, ok, note] of results) console.log(ok ? "PASS" : "FAIL", id, "-", note);
const bad = results.filter(([, ok]) => !ok);
console.log(bad.length || results.length < PRESETS.length ? `PRESETS FAILED: ${bad.map(([i]) => i).join(", ")}` : "PRESETS PASSED");
process.exit(bad.length || results.length < PRESETS.length ? 1 : 0);
