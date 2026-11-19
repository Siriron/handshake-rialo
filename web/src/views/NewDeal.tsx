import { useMemo, useState } from "react";
import { Ring, type NodeState } from "../components/Ring";
import { addMilestoneIx, createIx, fundIx } from "../lib/rialo/instructions";
import { dealAddress, bytesToHex, randomSlug } from "../lib/rialo/pda";
import { PublicKey, sendIx } from "../lib/rialo/chain";
import { MAX_MILESTONES } from "../lib/rialo/config";
import { client, saveDeal, useSession } from "../lib/session";
import { fmtRlo, parseRlo, short } from "../lib/format";
import { kindValue, validateDraft, type Draft } from "../lib/validate";

const blank = (): Draft => ({ amount: "", minutes: "", kind: "pr", target: "" });
type StepState = "wait" | "run" | "ok" | "bad";

export function NewDeal({ themeKey }: { themeKey: string }) {
  const s = useSession();
  const [seller, setSeller] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([{ amount: "", minutes: "", kind: "pr", target: "" }]);
  const [touched, setTouched] = useState(false);
  const [steps, setSteps] = useState<{ name: string; st: StepState }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const errors = useMemo(() => validateDraft(seller, s?.address ?? null, drafts), [seller, s?.address, drafts]);
  const hasErrors = !!errors.seller || errors.some((e) => e.length);
  const total = drafts.reduce((n, d) => n + (parseRlo(d.amount) ?? 0n), 0n);
  const short_ = s?.balance !== null && s?.balance !== undefined && total > 0n && s.balance < total + 20_000_000n;
  const nodes: NodeState[] = drafts.map((d) => (parseRlo(d.amount) ? "draft" : "empty"));
  const set = (i: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const fieldErr = (i: number, f: keyof Draft) => touched ? errors[i]?.find((e) => e.field === f)?.message : undefined;

  async function submit() {
    setTouched(true);
    if (!s || hasErrors || busy) return;
    setBusy(true); setError(null); setDone(null);
    const slug = randomSlug();
    const payee = PublicKey.fromString(seller.trim());
    const address = dealAddress(s.publicKey, slug).toString();
    const t0 = Date.now();
    const plan: [string, () => ReturnType<typeof sendIx>][] = [
      ["Create the deal", () => sendIx(client, s.signer, createIx(s.publicKey, slug, payee))],
      ...drafts.map((d, i): [string, () => ReturnType<typeof sendIx>] => [
        `Add milestone ${i + 1}`,
        () => sendIx(client, s.signer, addMilestoneIx(s.publicKey, slug, parseRlo(d.amount)!, BigInt(t0 + Number(d.minutes) * 60_000), kindValue(d.kind), d.target.trim())),
      ]),
      ["Fund the deal", () => sendIx(client, s.signer, fundIx(s.publicKey, slug))],
    ];
    setSteps(plan.map(([name]) => ({ name, st: "wait" })));
    saveDeal({ address, slug: bytesToHex(slug), seller: seller.trim(), createdAt: Date.now() });
    for (let i = 0; i < plan.length; i++) {
      setSteps((p) => p.map((x, j) => (j === i ? { ...x, st: "run" } : x)));
      try {
        await plan[i]![1]();
        setSteps((p) => p.map((x, j) => (j === i ? { ...x, st: "ok" } : x)));
        await new Promise((r) => setTimeout(r, 2500)); // control calls must land one at a time
      } catch (e) {
        setSteps((p) => p.map((x, j) => (j === i ? { ...x, st: "bad" } : x)));
        setError(`${plan[i]![0]} failed: ${(e as Error).message}. ${i > 0 ? "The deal exists but is not funded; nothing was paid out." : "Nothing was created."}`);
        setBusy(false); void s.refresh();
        return;
      }
    }
    setDone(address); setBusy(false); void s.refresh();
  }

  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <h1>Pay when the work ships.</h1>
          <p className="lede">Fund a deal in milestones. At each deadline Rialo validators check GitHub and the program pays the seller or refunds you. Nobody has to press a button.</p>
        </div>
        <Ring nodes={nodes} themeKey={themeKey} />
      </section>

      <section className="panel" aria-labelledby="w">
        <div><h2 id="w">Your wallet</h2><p className="sub">A devnet key made in this browser.</p></div>
        <div className="stack">
          <div className="field"><span className="label">Address</span><span className="mono">{s?.address ?? "Creating key…"}</span></div>
          <div className="facts" style={{ margin: 0 }}>
            <div className="fact"><span className="label">Balance</span><b>{s?.balance == null ? "…" : `${fmtRlo(s.balance)} RLO`}</b></div>
          </div>
          <div className="actions">
            <button className="btn ghost sm" onClick={async () => setFaucetMsg((await s?.faucet()) ?? "Requested 1 RLO from the faucet.")}>Get 1 test RLO</button>
            <button className="btn ghost sm" onClick={() => confirm("Delete this browser key? Funds on it are lost.") && s?.reset()}>New key</button>
          </div>
          {faucetMsg && <p className="note" role="status">{faucetMsg}</p>}
          <p className="note">Devnet only. This key is stored in this browser and is not a place for real funds.</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="d">
        <div><h2 id="d">The deal</h2><p className="sub">Up to {MAX_MILESTONES} milestones, each tied to one GitHub release or pull request.</p></div>
        <div className="stack">
          <div className="field">
            <label className="label" htmlFor="seller">Seller address</label>
            <input id="seller" value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="Who gets paid if the work ships" spellCheck={false} autoComplete="off" />
            {touched && errors.seller && <span className="err">{errors.seller}</span>}
          </div>
          {drafts.map((d, i) => (
            <fieldset key={i} className="ms" style={{ margin: 0 }}>
              <div className="ms-head"><legend className="label" style={{ padding: 0 }}>Milestone {i + 1}</legend>
                {drafts.length > 1 && <button className="btn ghost sm" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}>Remove</button>}</div>
              <div className="row">
                <div className="field"><label className="label" htmlFor={`a${i}`}>Amount (RLO)</label>
                  <input id={`a${i}`} inputMode="decimal" value={d.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="0.5" />
                  {fieldErr(i, "amount") && <span className="err">{fieldErr(i, "amount")}</span>}</div>
                <div className="field"><label className="label" htmlFor={`m${i}`}>Due in (min)</label>
                  <input id={`m${i}`} inputMode="numeric" value={d.minutes} onChange={(e) => set(i, { minutes: e.target.value })} placeholder="10" />
                  {fieldErr(i, "minutes") && <span className="err">{fieldErr(i, "minutes")}</span>}</div>
                <div className="field"><label className="label" htmlFor={`k${i}`}>Evidence</label>
                  <select id={`k${i}`} value={d.kind} onChange={(e) => set(i, { kind: e.target.value as Draft["kind"] })}>
                    <option value="pr">Merged pull request</option><option value="release">Published release</option></select></div>
                <div className="field"><label className="label" htmlFor={`t${i}`}>{d.kind === "pr" ? "owner/repo#number" : "owner/repo@tag"}</label>
                  <input id={`t${i}`} value={d.target} onChange={(e) => set(i, { target: e.target.value })} placeholder={d.kind === "pr" ? "acme/site#42" : "acme/site@v1.0.0"} spellCheck={false} autoComplete="off" />
                  {fieldErr(i, "target") && <span className="err">{fieldErr(i, "target")}</span>}</div>
              </div>
            </fieldset>
          ))}
          <div className="actions">
            {drafts.length < MAX_MILESTONES && <button className="btn ghost" onClick={() => setDrafts((x) => [...x, blank()])}>Add a milestone</button>}
            <span className="note">Total {fmtRlo(total)} RLO. The first check runs at the first deadline.</span>
          </div>
          {short_ && <p className="banner">Your balance is below the total plus fees. Use the faucet first.</p>}
          <div className="actions">
            <button className="btn" disabled={busy || !s} onClick={submit}>{busy ? "Working…" : "Create and fund the deal"}</button>
            {touched && hasErrors && <span className="note">Fix the highlighted fields to continue.</span>}
          </div>
          {steps.length > 0 && (
            <ol className="steps" aria-live="polite">
              {steps.map((p) => <li key={p.name}><span className={`dot ${p.st === "wait" ? "" : p.st}`} /><span>{p.name}</span></li>)}
            </ol>
          )}
          {error && <p className="banner bad" role="alert">{error}</p>}
          {done && (
            <div className="banner" role="status">
              The deal is funded. Share this link with the seller: <a href={`#track/${done}`}>{short(done)}</a>
              <div className="actions" style={{ marginTop: 10 }}>
                <a className="btn ghost sm" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={`#track/${done}`}>Open the deal</a>
                <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#track/${done}`)}>Copy link</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
