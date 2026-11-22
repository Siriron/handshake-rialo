import { SANS, SERIF } from "./core";
import type { Item } from "../data";
import { phaseName } from "../lib/rialo/decode";
import { fmtRlo, short } from "../lib/format";
import { pal } from "../theme";

const W = 640, H = 360;
const stateColor = (n: string) => { const p = pal(); return ({ paid: p.paid, refunded: p.refunded, funded: p.funded, checking: p.funded } as Record<string, string>)[n] ?? p.mute; };
const mk = (w = W, h = H) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = "";
  for (const w of text.split(" ")) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function base(g: CanvasRenderingContext2D, accent: string) {
  const p = pal(), bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, p.cardA); bg.addColorStop(1, p.cardB);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (p.dark) { g.strokeStyle = accent; g.globalAlpha = .55; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2); g.globalAlpha = 1; return; }
  // Day mode: white cards on a grey page need a firm edge and a colour band to stand apart.
  g.strokeStyle = accent; g.globalAlpha = .85; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4); g.globalAlpha = 1;
  g.fillStyle = accent; g.fillRect(0, 0, W, 12);
}
const acc = (face: string) => { const p = pal(); return ({ rule: p.edge, verified: p.paid, open: p.refunded, deal: p.funded } as Record<string, string>)[face]!; };

/** Still face of a card (what the tile shows). */
export function drawStill(it: Item, chip = false): HTMLCanvasElement {
  const c = mk(), g = c.getContext("2d")!; base(g, acc(it.face));
  g.fillStyle = pal().mute; g.font = `500 28px ${SANS}`; g.textBaseline = "top"; if (!chip) g.fillText(it.category, 32, 30);
  g.textAlign = "right"; g.fillText(it.meta, W - 32, 30); g.textAlign = "left";
  if (it.face === "deal") return drawDealBody(g, c, it);
  g.fillStyle = pal().ink; g.font = `300 66px ${SERIF}`;
  const lines = wrap(g, it.title, W - 64).slice(0, 2); let y = 84;
  for (const l of lines) { g.fillText(l, 32, y); y += 68; }
  const sentence = (/^[^.]*\./.exec(it.description)?.[0] ?? it.description);
  g.fillStyle = pal().mute; g.font = `400 25px ${SANS}`;
  const sum = wrap(g, sentence, W - 64).slice(0, 3); let sy = H - 28 - sum.length * 32;
  g.fillStyle = acc(it.face); g.globalAlpha = .7; g.fillRect(32, sy - 14, 44, 3); g.globalAlpha = 1; g.fillStyle = pal().mute;
  for (const l of sum) { g.fillText(l, 32, sy); sy += 32; }
  return c;
}
function drawDealBody(g: CanvasRenderingContext2D, c: HTMLCanvasElement, it: Item) {
  g.fillStyle = pal().ink; g.font = `300 46px ${SERIF}`; g.fillText(it.title, 32, 78);
  const d = it.live?.deal;
  if (!d) { g.fillStyle = pal().mute; g.font = `italic 300 26px ${SERIF}`; g.fillText(it.live === null ? "Reading from devnet…" : "Not found", 32, 150); return c; }
  const n = d.milestones.length, gap = 10, bw = (W - 64 - gap * (n - 1)) / n;
  d.milestones.forEach((m, i) => {
    const x = 32 + i * (bw + gap), col = stateColor(phaseName(m.status));
    g.fillStyle = col; g.globalAlpha = .22; g.fillRect(x, 150, bw, 110); g.globalAlpha = 1;
    g.fillStyle = col; g.fillRect(x, 150, bw, 3);
    g.fillStyle = pal().ink; g.font = `500 20px ${SANS}`; g.fillText(`${fmtRlo(m.amount)} RLO`, x + 10, 172);
    g.fillStyle = col; g.font = `italic 300 22px ${SERIF}`; g.fillText(phaseName(m.status), x + 10, 208);
  });
  const tot = d.milestones.reduce((n, m) => n + m.amount, 0n), done = d.milestones.filter((m) => m.status >= 3n).length;
  g.fillStyle = pal().mute; g.font = `500 22px ${SANS}`; g.fillText(`Total ${fmtRlo(tot)} RLO`, 32, H - 56);
  g.textAlign = "right"; g.fillText(`${done} of ${d.milestones.length} settled · ${short(d.payee)}`, W - 32, H - 56); g.textAlign = "left";
  return c;
}
/** Second face shown on hover: the description. */
export function drawDetail(it: Item): HTMLCanvasElement {
  const c = mk(), g = c.getContext("2d")!; base(g, acc(it.face));
  g.fillStyle = pal().mute; g.font = `500 22px ${SANS}`; g.textBaseline = "top"; g.fillText(it.title, 32, 30);
  g.fillStyle = pal().ink; g.font = `300 31px ${SERIF}`;
  let y = 84; for (const l of wrap(g, it.description, W - 64).slice(0, 6)) { g.fillText(l, 32, y); y += 40; }
  if (it.face === "deal" && it.live) {
    g.fillStyle = pal().funded; g.font = `italic 300 26px ${SERIF}`; g.fillText("Open the deal", 32, H - 56);
  }
  return c;
}
export function drawText(text: string, font: string, color: string, dpr = 2): HTMLCanvasElement {
  const t = mk(8, 8).getContext("2d")!; t.font = font; const w = Math.ceil(t.measureText(text).width) + 4;
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "16");
  const c = mk(w * dpr, Math.ceil(px * 1.5) * dpr), g = c.getContext("2d")!;
  g.scale(dpr, dpr); g.font = font; g.fillStyle = color; g.textBaseline = "middle"; g.fillText(text, 2, c.height / dpr / 2); return c;
}
