import { PROGRAM_ID, REX_ID } from "../lib/rialo/config";

const REPO = "https://github.com/Siriron/handshake-rialo";

export function Proof() {
  return (
    <div className="wrap" style={{ paddingTop: 56 }}>
      <h1 style={{ maxWidth: "none" }}>What is proven, and what is not.</h1>
      <p className="lede">Handshake runs on Rialo devnet. This page separates what a live test has shown from what is only argued in the code.</p>

      <div className="panel">
        <div><h2>Shown on devnet</h2><p className="sub">By recorded runs, not by reading the code.</p></div>
        <table className="claims"><tbody>
          <tr><td className="ok-t">Pays</td><td>A milestone whose GitHub evidence is present is paid to the seller at its deadline, with no keeper and no manual step.</td></tr>
          <tr><td className="ok-t">Refunds</td><td>A milestone whose evidence is missing, such as an unmerged pull request, is refunded to the buyer.</td></tr>
          <tr><td className="ok-t">Early approval</td><td>The buyer can approve a milestone before its deadline and the seller is paid.</td></tr>
          <tr><td className="ok-t">This site</td><td>The address derivation, instruction bytes and account decoder used here are checked against recorded devnet transactions and accounts.</td></tr>
        </tbody></table>
      </div>

      <div className="panel">
        <div><h2>Not shown</h2><p className="sub">Treat these as open.</p></div>
        <table className="claims"><tbody>
          <tr><td className="no-t">Direct calls</td><td>Handler functions called with raw transactions rather than through the program flow.</td></tr>
          <tr><td className="no-t">Forged report</td><td>A forged verifier report argument submitted on chain.</td></tr>
          <tr><td className="no-t">Stuck checks</td><td>The rescue path for a stuck check, and a drained fee wallet, on chain.</td></tr>
          <tr><td className="no-t">Long deals</td><td>Deals that run for many hours.</td></tr>
          <tr><td className="no-t">Funds</td><td>This is devnet. Nothing here holds real value, and the wallet is a throwaway browser key.</td></tr>
        </tbody></table>
      </div>

      <div className="panel">
        <div><h2>Addresses</h2><p className="sub">Rialo devnet.</p></div>
        <div className="stack">
          <div className="field"><span className="label">Handshake program</span><span className="mono">{PROGRAM_ID}</span></div>
          <div className="field"><span className="label">REX verifier</span><span className="mono">{REX_ID}</span></div>
          <div className="actions">
            <a href={REPO} target="_blank" rel="noreferrer noopener">Source</a>
            <a href={`${REPO}/blob/main/docs/EVIDENCE.md`} target="_blank" rel="noreferrer noopener">Evidence</a>
            <a href={`${REPO}/blob/main/docs/THREAT_MODEL.md`} target="_blank" rel="noreferrer noopener">Threat model</a>
          </div>
        </div>
      </div>
    </div>
  );
}
