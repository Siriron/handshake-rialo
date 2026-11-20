import { $, esc, gsap } from "./core";
import { client, faucet, loadDeals, onWallet, refreshBalance, resetWallet, saveDeal, wallet, balance } from "../session";
import { PublicKey, readDeal, sendIx, type DealRead } from "../lib/rialo/chain";
import { addMilestoneIx, approveIx, createIx, fundIx } from "../lib/rialo/instructions";
import { bytesToHex, dealAddress, hexToBytes, randomSlug } from "../lib/rialo/pda";
import { phaseName } from "../lib/rialo/decode";
import { countdown, evidenceUrl, fmtRlo, parseRlo, short } from "../lib/format";
import { kindValue, validateDraft, type Draft } from "../lib/validate";
import { MAX_MILESTONES } from "../lib/rialo/config";
import { dealItem } from "../data";
import { drawStill } from "./cards";

const box = () => $("#lightbox"), inner = () => $("#lbInner");
let onClose: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
export const isOpen = () => box().style.visibility === "visible";

export function open(html: string, close?: () => void) {
  inner().innerHTML = html; onClose = close ?? null;
  gsap.killTweensOf([box(), inner()]);
  gsap.set(box(), { visibility: "visible" });
  gsap.to(box(), { opacity: 1, duration: .45 });
  gsap.fromTo(inner(), { scale: .94, y: 20 }, { scale: 1, y: 0, duration: .9, ease: "expo.out" });
  box().scrollTop = 0;
}
export function close() {
  if (!isOpen()) return;
  if (timer) clearInterval(timer), (timer = null);
  gsap.to(box(), { opacity: 0, duration: .35, onComplete: () => { gsap.set(box(), { visibility: "hidden" }); inner().innerHTML = ""; } });
  onClose?.(); onClose = null;
  if (location.hash.startsWith("#deal/")) history.replaceState(null, "", "#deals");
}
box().addEventListener("click", (e) => { if (e.target === box()) close(); });
addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

const head = (title: string, meta: string) => `<div class="lb-head"><div><b>${esc(title)}</b> <span class="serif">${esc(meta)}</span></div><button class="pill" data-close>Close</button></div>`;
const wireClose = () => inner().querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

/* ---------- deal detail ---------- */
export async function openDeal(address: string) {
  open(`${head("Deal", short(address))}<p class="note" role="status">Reading the deal from devnet…</p>`);
  wireClose();
  let read: DealRead | null = null, err: string | null = null;
  const load = async () => { try { read = await readDeal(client, address); err = null; } catch (e) { err = (e as Error).message; read = null; } };
  const paint = () => {
    if (!isOpen()) return;
    if (!read) { inner().innerHTML = `${head("Deal", short(address))}<p class="lb-desc">${esc(err ?? "Nothing exists at this address yet. If it was just created, give it a few seconds.")}</p>`; wireClose(); return; }
    const d = read.deal, saved = loadDeals().find((x) => x.address === address), isBuyer = wallet?.address === d.owner;
    const total = d.milestones.reduce((n, m) => n + m.amount, 0n), now = Date.now();
    const rows = d.milestones.map((m) => {
      const ph = phaseName(m.status), url = evidenceUrl(m.kind, m.target), live = m.status === 1n || m.status === 2n;
      const left = Number(m.deadlineMs) - now;
      return `<div class="ms-row"><span class="ms-n">${m.index + 1}</span><div><div class="ms-t">${fmtRlo(m.amount)} RLO · ${url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer noopener">${esc(m.target)}</a>` : esc(m.target)}</div>
      <div class="note">${m.kind === 1n ? "Published release" : "Merged pull request"}${live ? ` · ${countdown(left)}` : ""}${m.approved ? " · approved by the buyer" : ""}</div>
      ${live && isBuyer ? `<div class="actions" style="margin-top:8px"><button class="btn ghost sm" data-approve="${m.index}" ${saved ? "" : "disabled"}>Approve now</button>${saved ? "" : `<span class="note">Needs the key saved in the browser that made this deal.</span>`}</div>` : ""}</div>
      <span class="ms-s ${ph}">${ph === "paid" ? "Paid to the seller" : ph === "refunded" ? "Refunded to the buyer" : ph === "checking" ? "Checking GitHub" : ph === "funded" ? "Funded" : "Not funded"}</span></div>`;
    }).join("");
    const card = drawStill(dealItem(address, "Deal", read)); 
    inner().innerHTML = `${head("Deal", short(address))}<div class="lb-card" id="lbCard"></div>
      <div class="facts"><div><span>Total</span><b>${fmtRlo(total)} RLO</b></div><div><span>Still held</span><b>${fmtRlo(d.remaining)} RLO</b></div><div><span>Seller</span><b class="mono" style="font-size:14px">${short(d.payee)}</b></div></div>
      <div class="ms-list" aria-label="Milestones">${rows}</div>
      <p class="note" id="lbErr" role="alert"></p>
      <div class="actions"><button class="btn ghost sm" data-copy>Copy share link</button><span class="note mono">${esc(address)}</span></div>`;
    $("#lbCard").appendChild(card); wireClose();
    inner().querySelector("[data-copy]")?.addEventListener("click", () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#deal/${address}`));
    inner().querySelectorAll<HTMLButtonElement>("[data-approve]").forEach((b) => b.addEventListener("click", async () => {
      if (!wallet || !saved) return; b.disabled = true; b.textContent = "Approving…";
      try { await sendIx(client, wallet.signer, approveIx(wallet.publicKey, hexToBytes(saved.slug), BigInt(b.dataset.approve!))); await load(); paint(); }
      catch (e) { $("#lbErr").textContent = `Approve failed: ${(e as Error).message}`; b.disabled = false; b.textContent = "Approve now"; }
    }));
  };
  await load(); paint();
  timer = setInterval(async () => { if (isOpen()) { await load(); if (!document.activeElement?.closest("[data-approve]")) paint(); } }, 6000);
}

/* ---------- new deal ---------- */
export function openNewDeal(done?: () => void) {
  const drafts: Draft[] = [{ amount: "", minutes: "", kind: "pr", target: "" }];
  let seller = "", touched = false, busy = false;
  const root = () => inner();
  const paintErrors = () => {
    if (!touched) return;
    const e = validateDraft(seller, wallet?.address ?? null, drafts);
    root().querySelectorAll<HTMLElement>("[data-e]").forEach((el) => {
      const [i, f] = el.dataset.e!.split(":");
      el.textContent = f === undefined ? (e.seller ?? "") : (e[Number(i)]?.find((x) => x.field === f)?.message ?? "");
    });
  };
  const render = () => {
    const errs = validateDraft(seller, wallet?.address ?? null, drafts);
    const total = drafts.reduce((n, d) => n + (parseRlo(d.amount) ?? 0n), 0n);
    const fe = (i: number, f: keyof Draft) => (touched ? errs[i]?.find((e) => e.field === f)?.message : undefined);
    const ms = drafts.map((d, i) => `<fieldset class="ms-form" style="margin:0"><div class="actions" style="justify-content:space-between"><legend class="lab" style="padding:0">Milestone ${i + 1}</legend>${drafts.length > 1 ? `<button type="button" class="btn ghost sm" data-rm="${i}">Remove</button>` : ""}</div>
      <div class="row"><div class="field"><label for="a${i}">Amount (RLO)</label><input id="a${i}" data-f="amount" data-i="${i}" inputmode="decimal" placeholder="0.5" value="${esc(d.amount)}"><span class="err" data-e="${i}:amount">${fe(i, "amount") ?? ""}</span></div>
      <div class="field"><label for="m${i}">Due in (minutes)</label><input id="m${i}" data-f="minutes" data-i="${i}" inputmode="numeric" placeholder="10" value="${esc(d.minutes)}"><span class="err" data-e="${i}:minutes">${fe(i, "minutes") ?? ""}</span></div></div>
      <div class="field"><label for="k${i}">Evidence</label><select id="k${i}" data-f="kind" data-i="${i}"><option value="pr" ${d.kind === "pr" ? "selected" : ""}>Merged pull request</option><option value="release" ${d.kind === "release" ? "selected" : ""}>Published release</option></select></div>
      <div class="field"><label for="t${i}">${d.kind === "pr" ? "owner/repo#number" : "owner/repo@tag"}</label><input id="t${i}" data-f="target" data-i="${i}" spellcheck="false" autocomplete="off" placeholder="${d.kind === "pr" ? "acme/site#42" : "acme/site@v1.0.0"}" value="${esc(d.target)}"><span class="err" data-e="${i}:target">${fe(i, "target") ?? ""}</span></div></fieldset>`).join("");
    const active = document.activeElement as HTMLInputElement | null, id = active?.id, pos = active?.selectionStart ?? null;
    root().innerHTML = `${head("New deal", "Rialo devnet")}
      <p class="lb-desc">Fund up to ${MAX_MILESTONES} milestones. At each deadline validators check GitHub and the program pays the seller or refunds you.</p>
      <div class="banner"><div class="lab">Your devnet wallet</div><div class="mono" style="margin:4px 0 8px">${wallet?.address ?? "Starting…"}</div>
        <div class="actions"><b class="serif" style="font-size:20px;font-weight:400">${balance == null ? "…" : fmtRlo(balance)} RLO</b><button type="button" class="btn ghost sm" data-faucet>Get 1 test RLO</button></div><p class="note" id="fMsg" role="status" style="margin:8px 0 0">Devnet only. This key lives in this browser.</p></div>
      <form class="form" id="dealForm" novalidate>
        <div class="field"><label for="seller">Seller address</label><input id="seller" spellcheck="false" autocomplete="off" placeholder="Who is paid if the work ships" value="${esc(seller)}"><span class="err" data-e="seller">${touched && errs.seller ? errs.seller : ""}</span></div>
        ${ms}
        <div class="actions">${drafts.length < MAX_MILESTONES ? `<button type="button" class="btn ghost" data-add>Add a milestone</button>` : ""}<span class="note">Total ${fmtRlo(total)} RLO</span></div>
        <div class="actions"><button class="btn" type="submit" ${busy ? "disabled" : ""}>${busy ? "Working…" : "Create and fund the deal"}</button></div>
        <ol class="steps" id="steps" aria-live="polite"></ol><p class="banner bad" id="dErr" role="alert" hidden></p><div id="dDone"></div>
      </form>`;
    wireClose();
    if (id) { const el = document.getElementById(id) as HTMLInputElement | null; if (el) { el.focus(); if (pos !== null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch { /* select */ } } }
    root().querySelector("[data-faucet]")?.addEventListener("click", async () => { const m = await faucet(); $("#fMsg").textContent = m ?? "Requested 1 RLO from the faucet."; });
    root().querySelector("[data-add]")?.addEventListener("click", () => { drafts.push({ amount: "", minutes: "", kind: "pr", target: "" }); render(); });
    root().querySelectorAll<HTMLElement>("[data-rm]").forEach((b) => b.addEventListener("click", () => { drafts.splice(Number(b.dataset.rm), 1); render(); }));
    $("#seller").addEventListener("input", (e) => { seller = (e.target as HTMLInputElement).value; paintErrors(); });
    root().querySelectorAll<HTMLInputElement>("[data-f]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      (drafts[Number(el.dataset.i)] as unknown as Record<string, string>)[el.dataset.f!] = el.value; if (el.tagName === "SELECT") render(); else paintErrors();
    }));
    $("#dealForm").addEventListener("submit", (e) => { e.preventDefault(); void submit(); });
  };
  async function submit() {
    touched = true;
    const errs = validateDraft(seller, wallet?.address ?? null, drafts);
    if (!wallet || busy || errs.seller || errs.some((e) => e.length)) return render();
    const w = wallet; busy = true; $("#dealForm").querySelector("button[type=submit]")!.setAttribute("disabled", "");
    const slug = randomSlug(), payee = PublicKey.fromString(seller.trim()), address = dealAddress(w.publicKey, slug).toString(), t0 = Date.now();
    const plan: [string, () => Promise<string>][] = [
      ["Create the deal", () => sendIx(client, w.signer, createIx(w.publicKey, slug, payee))],
      ...drafts.map((d, i): [string, () => Promise<string>] => [`Add milestone ${i + 1}`, () => sendIx(client, w.signer, addMilestoneIx(w.publicKey, slug, parseRlo(d.amount)!, BigInt(t0 + Number(d.minutes) * 60_000), kindValue(d.kind), d.target.trim()))]),
      ["Fund the deal", () => sendIx(client, w.signer, fundIx(w.publicKey, slug))],
    ];
    const ol = $("#steps"); ol.innerHTML = plan.map(([n]) => `<li><span class="sd"></span><span>${n}</span></li>`).join("");
    const dot = (i: number, c: string) => ol.children[i]!.firstElementChild!.className = `sd ${c}`;
    saveDeal({ address, slug: bytesToHex(slug), seller: seller.trim(), createdAt: Date.now() });
    for (let i = 0; i < plan.length; i++) {
      dot(i, "run");
      try { await plan[i]![1](); dot(i, "ok"); await new Promise((r) => setTimeout(r, 2500)); }
      catch (e) {
        dot(i, "bad"); const el = $("#dErr"); el.hidden = false;
        el.textContent = `${plan[i]![0]} failed: ${(e as Error).message}. ${i > 0 ? "The deal exists but is not funded; nothing was paid out." : "Nothing was created."}`;
        busy = false; $("#dealForm").querySelector("button[type=submit]")!.removeAttribute("disabled"); void refreshBalance(); return;
      }
    }
    busy = false; void refreshBalance(); done?.();
    $("#dDone").innerHTML = `<div class="banner">The deal is funded. Share the link with the seller.<div class="actions" style="margin-top:10px"><button type="button" class="btn sm" data-open>Open the deal</button><button type="button" class="btn ghost sm" data-copy>Copy link</button></div></div>`;
    $("#dDone [data-open]").addEventListener("click", () => { close(); setTimeout(() => (location.hash = `deal/${address}`), 400); });
    $("#dDone [data-copy]").addEventListener("click", () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#deal/${address}`));
  }
  open("", () => { /* nothing to clean */ }); render();
  const off = onWallet(() => { if (isOpen() && !busy && !document.activeElement?.closest("#lbInner input,#lbInner select")) render(); });
  const prev = onClose; onClose = () => { off(); prev?.(); };
}

export function openWallet() {
  const paint = () => {
    inner().innerHTML = `${head("Wallet", "Rialo devnet")}<p class="lb-desc">A throwaway key made in this browser. It signs your deals and is for devnet test funds only.</p>
      <div class="banner"><div class="lab">Address</div><div class="mono" style="margin:4px 0 10px">${wallet?.address ?? "Starting…"}</div><b class="serif" style="font-size:22px;font-weight:400">${balance == null ? "…" : fmtRlo(balance)} RLO</b></div>
      <div class="actions"><button class="btn ghost sm" data-faucet>Get 1 test RLO</button><button class="btn ghost sm" data-reset>New key</button></div><p class="note" id="wMsg" role="status"></p>`;
    wireClose();
    inner().querySelector("[data-faucet]")?.addEventListener("click", async () => { $("#wMsg").textContent = (await faucet()) ?? "Requested 1 RLO from the faucet."; });
    inner().querySelector("[data-reset]")?.addEventListener("click", () => confirm("Delete this browser key? Funds and approval rights for deals made with it are lost.") && resetWallet());
  };
  open(""); paint(); const off = onWallet(() => isOpen() && paint()); const prev = onClose; onClose = () => { off(); prev?.(); };
}
