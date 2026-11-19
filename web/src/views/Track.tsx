import { useCallback, useEffect, useState } from "react";
import { Ring, type NodeState } from "../components/Ring";
import { approveIx } from "../lib/rialo/instructions";
import { hexToBytes } from "../lib/rialo/pda";
import { PublicKey, readDeal, sendIx, type DealRead } from "../lib/rialo/chain";
import { phaseName } from "../lib/rialo/decode";
import { client, loadDeals, useSession } from "../lib/session";
import { countdown, evidenceUrl, fmtRlo, short } from "../lib/format";

const COPY: Record<string, string> = {
  created: "Not funded", funded: "Funded, waiting for the deadline", checking: "Checking GitHub",
  paid: "Paid to the seller", refunded: "Refunded to the buyer", unknown: "Unknown",
};

export function Track({ address, themeKey }: { address?: string; themeKey: string }) {
  if (!address) return <Lookup />;
  return <Deal address={address} themeKey={themeKey} />;
}

function Lookup() {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const saved = loadDeals();
  const go = () => {
    try { PublicKey.fromString(v.trim()); location.hash = `track/${v.trim()}`; }
    catch { setErr("That is not a valid deal address."); }
  };
  return (
    <div className="wrap" style={{ paddingTop: 56 }}>
      <h1 style={{ maxWidth: "none" }}>Follow a deal.</h1>
      <p className="lede">Paste the deal address you were sent. Anyone can read a deal; only the buyer can approve a milestone early.</p>
      <div className="panel">
        <div><h2>Open a deal</h2></div>
        <div className="stack">
          <div className="field"><label className="label" htmlFor="addr">Deal address</label>
            <input id="addr" value={v} onChange={(e) => { setV(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && go()} spellCheck={false} autoComplete="off" />
            {err && <span className="err">{err}</span>}</div>
          <div className="actions"><button className="btn" onClick={go}>Open the deal</button></div>
        </div>
      </div>
      <div className="panel">
        <div><h2>Created in this browser</h2></div>
        {saved.length === 0 ? <p className="note">Deals you create here will be listed here.</p> : (
          <div className="list">{saved.map((d) => (
            <a key={d.address} href={`#track/${d.address}`}><span className="mono">{short(d.address)}</span><span className="note">{new Date(d.createdAt).toLocaleString()}</span></a>
          ))}</div>
        )}
      </div>
    </div>
  );
}

function Deal({ address, themeKey }: { address: string; themeKey: string }) {
  const s = useSession();
  const [read, setRead] = useState<DealRead | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<number | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const saved = loadDeals().find((d) => d.address === address);

  const load = useCallback(async () => {
    try { setRead(await readDeal(client, address)); setErr(null); }
    catch (e) { setErr((e as Error).message); setRead(null); }
  }, [address]);
  useEffect(() => { setRead(undefined); void load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (read === undefined) return <div className="wrap" style={{ paddingTop: 56 }}><p className="note" role="status">Reading the deal from devnet…</p></div>;
  if (!read) return (
    <div className="wrap" style={{ paddingTop: 56 }}>
      <h1>No deal here.</h1>
      <p className="lede">{err ?? "Nothing exists at this address yet. If it was just created, give it a few seconds."}</p>
      <div className="actions" style={{ marginTop: 20 }}><button className="btn ghost" onClick={load}>Check again</button><a href="#track">Back</a></div>
    </div>
  );

  const { deal } = read;
  const nodes: NodeState[] = deal.milestones.map((m) => (phaseName(m.status) as NodeState) === ("unknown" as NodeState) ? "empty" : (phaseName(m.status) as NodeState));
  const total = deal.milestones.reduce((n, m) => n + m.amount, 0n);
  const isBuyer = s?.address === deal.owner;

  async function approve(i: number) {
    if (!s || !saved) return;
    setBusy(i); setActionErr(null);
    try { await sendIx(client, s.signer, approveIx(s.publicKey, hexToBytes(saved.slug), BigInt(i))); await load(); }
    catch (e) { setActionErr(`Approve failed: ${(e as Error).message}`); }
    setBusy(null);
  }

  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <h1>{deal.milestones.every((m) => m.status >= 3n) ? "Settled." : "In progress."}</h1>
          <p className="lede">Updates every few seconds. Each milestone is decided at its own deadline.</p>
          <div className="facts">
            <div className="fact"><span className="label">Total</span><b>{fmtRlo(total)} RLO</b></div>
            <div className="fact"><span className="label">Still held</span><b>{fmtRlo(deal.remaining)} RLO</b></div>
            <div className="fact"><span className="label">Seller</span><b className="mono" style={{ fontSize: 14 }}>{short(deal.payee)}</b></div>
          </div>
        </div>
        <Ring nodes={nodes} themeKey={themeKey} />
      </section>
      <section className="tl" aria-label="Milestones">
        {deal.milestones.map((m) => {
          const ph = phaseName(m.status);
          const url = evidenceUrl(m.kind, m.target);
          const left = Number(m.deadlineMs) - now;
          const open = m.status === 1n || m.status === 2n;
          return (
            <div className="tl-item" key={m.index}>
              <span className="tl-n">{m.index + 1}</span>
              <div>
                <div className="tl-t">{fmtRlo(m.amount)} RLO · {url ? <a href={url} target="_blank" rel="noreferrer noopener">{m.target}</a> : m.target}</div>
                <div className="note">{m.kind === 1n ? "Published release" : "Merged pull request"}{open && ` · ${countdown(left)}`}{m.approved && " · approved by the buyer"}{m.checks > 0n && ` · ${m.checks} check${m.checks > 1n ? "s" : ""}`}</div>
                {open && isBuyer && (
                  <div className="actions" style={{ marginTop: 8 }}>
                    <button className="btn ghost sm" disabled={!saved || busy !== null} onClick={() => approve(m.index)}>{busy === m.index ? "Approving…" : "Approve now"}</button>
                    {!saved && <span className="note">Approving needs the deal key saved in the browser that created it.</span>}
                  </div>
                )}
              </div>
              <span className={`state ${ph}`}>{COPY[ph]}</span>
            </div>
          );
        })}
      </section>
      {actionErr && <p className="banner bad" role="alert" style={{ marginTop: 16 }}>{actionErr}</p>}
      <p className="note" style={{ marginTop: 20 }}>Deal account <span className="mono">{address}</span></p>
    </div>
  );
}
