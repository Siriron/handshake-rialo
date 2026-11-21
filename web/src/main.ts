import { $, $$, gsap, reduced, type View } from "./ui/core";
import { initWallet, onWallet, balance, wallet } from "./session";
import { fmtRlo } from "./lib/format";
import { close as closeLb, openDeal, openWallet } from "./ui/panels";
import { createGallery } from "./views/gallery";

const dock = $("#dock");
let dockShown = false;
const showDock = () => { if (dockShown) return; dockShown = true; dock.style.pointerEvents = "auto"; gsap.fromTo(dock, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .9, ease: "expo.out" }); };

const views: Record<string, View> = {};
const ids = { explore: "gallery", deals: "projects", proof: "about" } as const;
let current: string | null = null, switching = false;

async function loadViews() {
  views.gallery = createGallery(showDock);
  const [{ createDeals }, { createAbout }] = await Promise.all([import("./views/deals"), import("./views/about")]);
  views.projects = createDeals(); views.about = createAbout();
}
function route(): { view: string; deal?: string } {
  const h = location.hash.slice(1);
  if (h.startsWith("deal/")) return { view: "projects", deal: h.slice(5) };
  return { view: ids[h as keyof typeof ids] ?? "gallery" };
}
async function go() {
  const { view, deal } = route();
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  if (deal) void openDeal(deal);
  if (view === current || switching) return;
  switching = true;
  const next = $(`#${view}`), prev = current ? $(`#${current}`) : null;
  const finish = () => {
    if (current) views[current]?.hide();
    if (prev) gsap.set(prev, { visibility: "hidden" });
    current = view; gsap.set(next, { visibility: "visible" }); views[view]!.show();
    gsap.to(next, { opacity: 1, duration: .5, ease: "power2.out", onComplete: () => { switching = false; if (route().view !== current) void go(); } });
    if (view !== "gallery") showDock();
  };
  if (prev) gsap.to(prev, { opacity: 0, duration: .35, ease: "power2.in", onComplete: finish }); else finish();
}
const menu = $("#menu"), btn = $("#menuBtn");
const setMenu = (o: boolean) => { menu.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o)); menu.setAttribute("aria-hidden", String(!o)); };
btn.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
$("#walletOpen").addEventListener("click", () => { setMenu(false); openWallet(); });
addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target as Node) && e.target !== btn) setMenu(false); });
let lastAddr: string | null | undefined;
onWallet(() => {
  $("#walletBal").textContent = !wallet ? "Disconnected" : balance == null ? "—" : `${fmtRlo(balance, 2)} RLO`;
  const a = wallet?.address ?? null;
  if (lastAddr !== undefined && a !== lastAddr && current) views[current]?.refresh?.(); // account changed: refresh in place, no reload
  lastAddr = a;
});
addEventListener("hashchange", () => { if (!location.hash.startsWith("#deal/")) closeLb(); void go(); });
addEventListener("resize", () => current && views[current]?.resize());
if (reduced) document.documentElement.style.scrollBehavior = "auto";

(async () => {
  await document.fonts.ready.catch(() => undefined);
  await loadViews();
  void initWallet();
  if (!location.hash) history.replaceState(null, "", "#explore");
  void go();
})();
