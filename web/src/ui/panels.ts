import { $, esc, gsap } from "./core";
import { accounts, activeIndex, addAccount, balance, client, disconnect, faucet, loadDeals, onWallet, reconnect, refreshBalance, saveDeal, switchAccount, wallet } from "../session";
import { PublicKey, readDeal, sendIx, type DealRead } from "../lib/rialo/chain";
import { approveIx } from "../lib/rialo/instructions";
import { bytesToHex, hexToBytes, randomSlug } from "../lib/rialo/pda";
import { phaseName } from "../lib/rialo/decode";
import { countdown, evidenceUrl, fmtRlo, parseRlo, short } from "../lib/format";
import { validateDraft, type Draft } from "../lib/validate";
import { MAX_MILESTONES } from "../lib/rialo/config";
import { dealItem } from "../data";
import { drawStill } from "./cards";
import { DEMO_SELLER, PRESETS, buildPlan, planAddress, presetNeeds, type Preset } from "../lib/presets";

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
/** Runs an async action on a button and shows working, done and failed states. */
async function withState(b: HTMLButtonElement, work: string, run: () => Promise<string | null>, done = "Done") {
  const label = b.textContent; b.disabled = true; b.textContent = work;
  const err = await run().catch((e: Error) => e.message || "Failed");
  b.textContent = err ? "Failed" : done; setTimeout(() => { b.textContent = label; b.disabled = false; }, 1600); return err;
}
const copy = (b: HTMLButtonElement, text: string) => withState(b, "Copying…", async () => { try { await navigator.clipboard.writeText(text); return null; } catch { return "Copy is blocked in this browser."; } }, "Copied");

/* ---------- deal detail ---------- */
export async function openDeal(address: string) {
  open(`${head("Deal", short(address))}<p class="note" role="status">Reading the deal from devnet…</p>`, () => off());
  wireClose();
  let read: DealRead | null = null, err: string | null = null;
  const load = async () => { try { read = await readDeal(client, address); err = null; } catch (e) { err = (e as Error).message; read = null; } };
  const paint = () => {
    if (!isOpen()) return;
    if (!read) { inner().innerHTML = `${head("Deal", short(address))}<p class="lb-desc">${esc(err ?? "Nothing exists at this address yet. If it was just created, give it a few seconds.")}</p>`; wireClose(); return; }
    const d = read.deal, saved = loadDeals().find((x) => x.address === address), isBuyer = wallet?.address === d.owner;
    const total = d.milestones.reduce((n, m) => n + m.amount, 0n), now = Date.now();
    const rows = d.milestones.map((m) => {
      const ph = phaseName(m.status), url = evidenceUrl(m.kind, m.target), live = m.status === 1n || m.status === 2n, left = Number(m.deadlineMs) - now;
      const label = ph === "paid" ? "Paid to the seller" : ph === "refunded" ? "Refunded to the buyer" : ph === "checking" ? "Checking GitHub" : ph === "funded" ? "Funded" : "Not funded";
      return `<div class="ms-row"><span class="ms-n">${m.index + 1}</span><div><div class="ms-t">${fmtRlo(m.amount)} RLO · ${url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer noopener">${esc(m.target)}</a>` : esc(m.target)}</div>
      <div class="note">${m.kind === 1n ? "Published release" : "Merged pull request"}${live ? ` · ${countdown(left)}` : ""}${m.approved ? " · approved by the buyer" : ""}</div>
      ${live && isBuyer ? `<div class="actions" style="margin-top:8px"><button class="btn ghost sm" data-approve="${m.index}" ${saved ? "" : "disabled"}>Approve now</button>${saved ? "" : `<span class="note">Needs the key saved in the browser that made this deal.</span>`}</div>` : ""}
      ${live && !isBuyer && wallet ? `<p class="note" style="margin:8px 0 0">Only the buyer's account can approve. Switch accounts in the Wallet panel.</p>` : ""}</div><span class="ms-s ${ph}">${label}</span></div>`;
    }).join("");
    inner().innerHTML = `${head("Deal", short(address))}<div class="lb-card" id="lbCard"></div>
      <div class="facts"><div><span>Total</span><b>${fmtRlo(total)} RLO</b></div><div><span>Still held</span><b>${fmtRlo(d.remaining)} RLO</b></div><div><span>Seller</span><b class="mono" style="font-size:14px">${short(d.payee)}</b></div></div>
      <div class="ms-list" aria-label="Milestones">${rows}</div><p class="note" id="lbErr" role="alert"></p>
      <div class="actions"><button class="btn ghost sm" data-copy>Copy share link</button><span class="note mono">${esc(address)}</span></div>`;
    $("#lbCard").appendChild(drawStill(dealItem(address, "Deal", read), true)); wireClose();
    const cp = inner().querySelector<HTMLButtonElement>("[data-copy]")!; cp.addEventListener("click", () => void copy(cp, `${location.origin}${location.pathname}#deal/${address}`));
    inner().querySelectorAll<HTMLButtonElement>("[data-approve]").forEach((b) => b.addEventListener("click", async () => {
      if (!wallet || !saved) return; const w = wallet;
      const e = await withState(b, "Approving…", async () => { await sendIx(client, w.signer, approveIx(w.publicKey, hexToBytes(saved.slug), BigInt(b.dataset.approve!))); await load(); return null; }, "Approved");
      $("#lbErr").textContent = e ? `Approve failed: ${e}` : ""; if (!e) paint();
    }));
  };
  const off = onWallet(() => { if (isOpen() && !document.activeElement?.closest("[data-approve]")) paint(); });
  await load(); paint();
  timer = setInterval(async () => { if (isOpen()) { await load(); if (!document.activeElement?.closest("[data-approve]")) paint(); } }, 6000);
}

/* ---------- new deal ---------- */
export function openNewDeal(done?: () => void) {
  const drafts: Draft[] = [{ amount: "", minutes: "", kind: "pr", target: "" }];
  let seller = "", touched = false, busy = false, preset: Preset | null = null;
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
    const need = preset ? presetNeeds(preset) : null, short_ = need !== null && balance !== null && balance < need;
    const ms = drafts.map((d, i) => `<fieldset class="ms-form" style="margin:0"><div class="actions" style="justify-content:space-between"><legend class="lab" style="padding:0">Milestone ${i + 1}</legend>${drafts.length > 1 ? `<button type="button" class="btn ghost sm" data-rm="${i}">Remove</button>` : ""}</div>
      <div class="row"><div class="field"><label for="a${i}">Amount (RLO)</label><input id="a${i}" data-f="amount" data-i="${i}" inputmode="decimal" placeholder="0.5" value="${esc(d.amount)}"><span class="err" data-e="${i}:amount">${fe(i, "amount") ?? ""}</span></div>
      <div class="field"><label for="m${i}">Due in (minutes)</label><input id="m${i}" data-f="minutes" data-i="${i}" inputmode="numeric" placeholder="10" value="${esc(d.minutes)}"><span class="err" data-e="${i}:minutes">${fe(i, "minutes") ?? ""}</span></div></div>
      <div class="field"><label for="k${i}">Evidence</label><select id="k${i}" data-f="kind" data-i="${i}"><option value="pr" ${d.kind === "pr" ? "selected" : ""}>Merged pull request</option><option value="release" ${d.kind === "release" ? "selected" : ""}>Published release</option></select></div>
      <div class="field"><label for="t${i}">${d.kind === "pr" ? "owner/repo#number" : "owner/repo@tag"}</label><input id="t${i}" data-f="target" data-i="${i}" spellcheck="false" autocomplete="off" placeholder="${d.kind === "pr" ? "acme/site#42" : "acme/site@v1.0.0"}" value="${esc(d.target)}"><span class="err" data-e="${i}:target">${fe(i, "target") ?? ""}</span></div></fieldset>`).join("");
    const active = document.activeElement as HTMLInputElement | null, id = active?.id, pos = active?.selectionStart ?? null;
    root().innerHTML = `${head("New deal", "Rialo devnet")}
      <p class="lb-desc">Fund up to ${MAX_MILESTONES} milestones. At each deadline validators check GitHub and the program pays the seller or refunds you.</p>
      ${wallet ? `<div class="banner"><div class="lab">Your devnet account</div><div class="mono" style="margin:4px 0 8px">${wallet.address}</div>
        <div class="actions"><b class="serif" style="font-size:20px;font-weight:400">${balance == null ? "…" : fmtRlo(balance)} RLO</b><button type="button" class="btn ghost sm" data-faucet>Get 1 test RLO</button></div><p class="note" id="fMsg" role="status" style="margin:8px 0 0">Devnet only. Test funds, no value.</p></div>`
      : `<div class="banner">No account is connected. <button type="button" class="btn sm" data-connect style="margin-left:8px">Connect</button></div>`}
      <div class="field"><label for="preset">Load demo deal</label><select id="preset"><option value="">Choose a tested example…</option>${PRESETS.map((p) => `<option value="${p.id}" ${preset?.id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
      ${preset ? `<div class="banner" id="presetNote"><b style="font-weight:500;color:var(--ink)">${esc(preset.name)}.</b> ${esc(preset.how)} Needs at least ${fmtRlo(need!)} RLO in the account.${short_ ? ` <span style="color:var(--warn)">Your balance is lower. Use “Get 1 test RLO” first.</span>` : ""} You can edit any value before creating the deal.</div>` : ""}
      <form class="form" id="dealForm" novalidate>
        <div class="field"><label for="seller">Seller address</label><input id="seller" spellcheck="false" autocomplete="off" placeholder="Who is paid if the work ships" value="${esc(seller)}"><span class="err" data-e="seller">${touched && errs.seller ? errs.seller : ""}</span></div>
        ${ms}
        <div class="actions">${drafts.length < MAX_MILESTONES ? `<button type="button" class="btn ghost" data-add>Add a milestone</button>` : ""}<span class="note">Total ${fmtRlo(total)} RLO</span></div>
        <div class="actions"><button class="btn" type="submit" ${busy || !wallet ? "disabled" : ""}>${busy ? "Working…" : "Create and fund the deal"}</button></div>
        <ol class="steps" id="steps" aria-live="polite"></ol><p class="banner bad" id="dErr" role="alert" hidden></p><div id="dDone"></div>
      </form>`;
    wireClose();
    if (id) { const el = document.getElementById(id) as HTMLInputElement | null; if (el) { el.focus(); if (pos !== null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch { /* select */ } } }
    const fb = root().querySelector<HTMLButtonElement>("[data-faucet]");
    fb?.addEventListener("click", async () => { const m = await withState(fb, "Requesting…", () => faucet(), "Received"); $("#fMsg").textContent = m ?? "1 test RLO added."; });
    root().querySelector("[data-connect]")?.addEventListener("click", () => void reconnect());
    $("#preset").addEventListener("change", (e) => {
      const p = PRESETS.find((x) => x.id === (e.target as HTMLSelectElement).value) ?? null; preset = p;
      if (p) { seller = DEMO_SELLER; drafts.splice(0, drafts.length, ...p.milestones.map((m) => ({ ...m }))); touched = false; }
      render();
    });
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
    const slug = randomSlug(), address = planAddress(w.publicKey, slug);
    const plan = buildPlan(w.publicKey, slug, PublicKey.fromString(seller.trim()), drafts, Date.now());
    const ol = $("#steps"); ol.innerHTML = plan.map(([n]) => `<li><span class="sd"></span><span>${n}</span></li>`).join("");
    const dot = (i: number, c: string) => { ol.children[i]!.firstElementChild!.className = `sd ${c}`; };
    saveDeal({ address, slug: bytesToHex(slug), seller: seller.trim(), createdAt: Date.now(), buyer: w.address });
    for (let i = 0; i < plan.length; i++) {
      dot(i, "run");
      try { await sendIx(client, w.signer, plan[i]![1]); dot(i, "ok"); await new Promise((r) => setTimeout(r, 2500)); }
      catch (e) {
        dot(i, "bad"); const el = $("#dErr"); el.hidden = false;
        el.textContent = `${plan[i]![0]} failed: ${(e as Error).message}. ${i > 0 ? "The deal exists but is not funded; nothing was paid out." : "Nothing was created."}`;
        busy = false; $("#dealForm").querySelector("button[type=submit]")!.removeAttribute("disabled"); void refreshBalance(); return;
      }
    }
    busy = false; void refreshBalance(); done?.();
    $("#dDone").innerHTML = `<div class="banner">The deal is funded. Share the link with the seller.<div class="actions" style="margin-top:10px"><button type="button" class="btn sm" data-open>Open the deal</button><button type="button" class="btn ghost sm" data-copy>Copy link</button></div></div>`;
    $("#dDone [data-open]").addEventListener("click", () => { close(); setTimeout(() => (location.hash = `deal/${address}`), 400); });
    const cp = $<HTMLButtonElement>("#dDone [data-copy]"); cp.addEventListener("click", () => void copy(cp, `${location.origin}${location.pathname}#deal/${address}`));
  }
  open("", () => off()); render();
  const off = onWallet(() => { if (isOpen() && !busy && !document.activeElement?.closest("#lbInner input,#lbInner select")) render(); });
}

/* ---------- wallet ---------- */
export function openWallet() {
  let msg = "";
  const paint = () => {
    const list = accounts.map((a) => `<div class="ms-row" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="mono">${esc(a.address)}</div><div class="note">${a.index === activeIndex() ? `Connected${balance == null ? "" : ` · ${fmtRlo(balance)} RLO`}` : "Saved in this browser"}</div></div>${a.index === activeIndex() ? `<span class="ms-s funded">In use</span>` : `<button class="btn ghost sm" data-use="${a.index}">Use</button>`}</div>`).join("");
    inner().innerHTML = `${head("Wallet", "Rialo devnet")}<p class="lb-desc">Throwaway devnet accounts made in this browser. Switching changes who signs; the page stays where it is. Test funds only.</p>
      <div class="ms-list">${list}</div>
      <div class="actions"><button class="btn ghost sm" data-faucet ${wallet ? "" : "disabled"}>Get 1 test RLO</button><button class="btn ghost sm" data-new>New account</button>${wallet ? `<button class="btn ghost sm" data-off>Disconnect</button>` : `<button class="btn sm" data-on>Connect</button>`}</div><p class="note" id="wMsg" role="status">${esc(msg)}</p>`;
    wireClose();
    inner().querySelectorAll<HTMLButtonElement>("[data-use]").forEach((b) => b.addEventListener("click", () => withState(b, "Switching…", async () => { await switchAccount(Number(b.dataset.use)); return null; }, "Switched")));
    const f = inner().querySelector<HTMLButtonElement>("[data-faucet]");
    f?.addEventListener("click", async () => { msg = (await withState(f, "Requesting…", () => faucet(), "Received")) ?? "1 test RLO added."; $("#wMsg").textContent = msg; });
    const n = inner().querySelector<HTMLButtonElement>("[data-new]")!;
    n.addEventListener("click", () => withState(n, "Creating…", async () => { await addAccount(); return null; }, "Created"));
    inner().querySelector("[data-off]")?.addEventListener("click", () => void disconnect());
    inner().querySelector("[data-on]")?.addEventListener("click", () => void reconnect());
  };
  open("", () => off()); paint();
  const off = onWallet(() => { if (isOpen()) paint(); });
}
