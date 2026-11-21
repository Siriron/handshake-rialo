import * as THREE from "three";
import { $, clamp, gsap, isTouch, reduced, SANS, SERIF, type View } from "../ui/core";
import { VERIFIED_DEALS, dealItem, type Item } from "../data";
import { drawDetail, drawStill, drawText } from "../ui/cards";
import { client, myDeals } from "../session";
import { readDeal } from "../lib/rialo/chain";
import { openNewDeal } from "../ui/panels";

const GLYPHS = ". : · , ; _".split(" ");
const toTex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

const TILE_V = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const TILE_F = `uniform sampler2D uTex,uTex2; uniform float uMix,uReveal,uTime; varying vec2 vUv;
void main(){ vec3 a=texture2D(uTex,vUv).rgb,b=texture2D(uTex2,vUv).rgb; vec3 media=mix(a,b,uMix);
 float sweep=fract(uTime*.6); float band=smoothstep(.18,0.,abs((vUv.x+vUv.y)/2.-sweep))*.035;
 gl_FragColor=vec4(mix(vec3(.085+band),media,uReveal),1.); }`;
const CHIP_F = `uniform sampler2D uTex,uTex2,uLabel; uniform float uMix,uReveal; uniform vec4 uRect; uniform vec2 uTile,uSize; varying vec2 vUv;
vec3 media(vec2 uv){ return mix(texture2D(uTex,uv).rgb,texture2D(uTex2,uv).rgb,uMix); }
void main(){ vec2 tuv=uRect.xy+vUv*uRect.zw; vec3 acc=vec3(0.);
 for(int i=0;i<32;i++){ float fi=float(i); float r=sqrt((fi+.5)/32.)*40.; float a=fi*2.39996323; acc+=media(clamp(tuv+vec2(cos(a),sin(a))*r/uTile,0.,1.)); }
 vec3 col=mix(acc/32.,vec3(.05),.45); vec4 l=texture2D(uLabel,vUv); col=mix(col,l.rgb,l.a);
 vec2 p=(vUv-.5)*uSize; vec2 q=abs(p)-uSize*.5+4.; float d=length(max(q,0.))+min(max(q.x,q.y),0.)-4.;
 gl_FragColor=vec4(col,(1.-smoothstep(-.8,.4,d))*uReveal); }`;
const POST_F = `uniform sampler2D tDiffuse; varying vec2 vUv;
vec3 enc(vec3 c){ return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c)); }
void main(){ const float band=.08; vec2 uv=vUv; float t=0.,dir=0.;
 if(uv.y>1.-band){ t=clamp((uv.y-(1.-band))/band,0.,1.); dir=-1.; } else if(uv.y<band){ t=clamp((band-uv.y)/band,0.,1.); dir=1.; }
 vec3 col;
 if(t>0.){ float sag=1.-sqrt(1.-t*t); vec2 p=uv; p.y+=dir*sag*band*1.; float d=(t-.5)*.01*30.; vec3 acc=vec3(0.),ws=vec3(0.);
  for(int i=0;i<16;i++){ float s=float(i)/15.; vec2 q=p; q.y+=(s-.5)*d*band*dir*-1.;
   vec3 w=vec3(smoothstep(.8,.2,s),smoothstep(0.,.5,s)*smoothstep(1.,.5,s),smoothstep(.2,.8,s)); acc+=texture2D(tDiffuse,clamp(q,0.,1.)).rgb*w; ws+=w; }
  col=acc/max(ws,vec3(1e-4)); } else col=texture2D(tDiffuse,uv).rgb;
 gl_FragColor=vec4(enc(col),1.); }`;

interface Tile { item: Item; kind: "new" | "deal"; mesh: THREE.Mesh; chip: THREE.Mesh; title: THREE.Mesh; cat: THREE.Mesh; still: THREE.CanvasTexture; hover: THREE.CanvasTexture;
  x: number; y: number; w: number; h: number; mix: number; reveal: number; shown: boolean; col: number; row: number; idx: string; entered: boolean; lastMix: number }

export function createDeals(): View {
  const root = $("#projects"), stage = $("#pStage"), bubble = $("#viewBubble");
  let built = false, running = false, raf = 0, firstShow = true;
  let renderer!: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, rt: THREE.WebGLRenderTarget, post: THREE.Mesh, postScene: THREE.Scene, postCam: THREE.OrthographicCamera;
  let vw = 0, vh = 0, pageH = 0, scroll = 0, target = 0, vel = 0, touchY = 0, touching = false, hoverIdx = -1, key = "";
  const content = new THREE.Group(), tiles: Tile[] = [], extras: THREE.Mesh[] = [], timeU = { value: 0 };
  let headline: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; draw: (p: number) => void } | null = null;
  const qx = gsap.quickTo(bubble, "x", { duration: .5, ease: "power3.out" }), qy = gsap.quickTo(bubble, "y", { duration: .5, ease: "power3.out" });
  const dpr = () => Math.min(devicePixelRatio, 2);

  const newItem = (): Item => ({ id: "new", title: "New deal", category: "Create", meta: "Devnet", face: "rule", tags: [], description: "Fund up to four milestones. Validators check GitHub at each deadline and the program pays or refunds." });
  function newCard(it: Item, hover = false) {
    const c = document.createElement("canvas"); c.width = 640; c.height = 360; const g = c.getContext("2d")!;
    const bg = g.createLinearGradient(0, 0, 640, 360); bg.addColorStop(0, "#19191b"); bg.addColorStop(1, "#111113"); g.fillStyle = bg; g.fillRect(0, 0, 640, 360);
    g.strokeStyle = "#8a8a88"; g.globalAlpha = .55; g.setLineDash([8, 8]); g.lineWidth = 2; g.strokeRect(1, 1, 638, 358); g.setLineDash([]); g.globalAlpha = 1;
    g.strokeStyle = "#ededeb"; g.lineWidth = 3; g.beginPath(); g.moveTo(320, 120); g.lineTo(320, 200); g.moveTo(280, 160); g.lineTo(360, 160); g.stroke();
    g.fillStyle = "#ededeb"; g.textAlign = "center"; g.font = `300 56px ${SERIF}`; g.fillText(hover ? "Fund it in minutes" : it.title, 320, 280);
    g.fillStyle = "#8a8a88"; g.font = `500 24px ${SANS}`; g.fillText(hover ? "Up to four milestones" : "Rialo devnet", 320, 322); return c;
  }

  function sources(): { item: Item; kind: "new" | "deal" }[] {
    const mine = myDeals().map((d) => ({ item: dealItem(d.address, "Your deal"), kind: "deal" as const }));
    const seen = new Set(mine.map((m) => m.item.address));
    const ver = VERIFIED_DEALS.filter((d) => !seen.has(d.address)).map((d) => ({ item: dealItem(d.address, d.label), kind: "deal" as const }));
    return [{ item: newItem(), kind: "new" }, ...mine, ...ver];
  }
  function textPlane(text: string, font: string, color: string, wPx?: number) {
    const c = drawText(text, font, color, dpr()), t = toTex(c); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    const w = c.width / dpr(), h = c.height / dpr();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); m.scale.set(w, h, 1); void wPx; return m;
  }

  function chipFor(label: string) {
    const lc = drawText(label, `500 12px ${SANS}`, "#ededeb", dpr()), cw = lc.width / dpr() + 16, chh = lc.height / dpr() / 1.5 + 10;
    const cc = document.createElement("canvas"); cc.width = Math.ceil(cw * dpr()); cc.height = Math.ceil(chh * dpr()); cc.getContext("2d")!.drawImage(lc, 8 * dpr(), 6 * dpr()); return { cc, cw, chh };
  }
  function setChip(t: Tile, label: string) {
    const { cc, cw, chh } = chipFor(label), mat = t.chip.material as THREE.ShaderMaterial, tex = mat.uniforms.uLabel!.value as THREE.CanvasTexture;
    tex.image = cc; tex.needsUpdate = true; (mat.uniforms.uSize!.value as THREE.Vector2).set(cw, chh); (mat.uniforms.uRect!.value as THREE.Vector4).set(8 / t.w, 1 - (8 + chh) / t.h, cw / t.w, chh / t.h);
    t.chip.scale.set(cw, chh, 1); (t.mesh.userData as { place: (d: number) => void }).place(0);
  }
  const stateWord = (it: Item) => {
    const m = it.live?.deal.milestones; if (!m?.length) return null; const p = m.filter((x) => x.status === 3n).length, r = m.filter((x) => x.status === 4n).length;
    if (p + r === m.length) return r === 0 ? "Paid" : p === 0 ? "Refunded" : "Settled"; return m.some((x) => x.status === 2n) ? "Checking" : m.some((x) => x.status === 1n) ? "Funded" : "Not funded";
  };
  function clearScene() { content.clear(); tiles.length = 0; extras.length = 0; headline = null; }
  function layout() {
    vw = stage.clientWidth; vh = stage.clientHeight;
    renderer.setSize(vw, vh, false); rt.setSize(vw * dpr(), vh * dpr());
    camera.aspect = vw / vh; camera.position.set(vw / 2, -vh / 2, (vh / 2) / Math.tan((35 / 2) * Math.PI / 180)); camera.lookAt(vw / 2, -vh / 2, 0); camera.updateProjectionMatrix();
    clearScene();
    const cols = vw > 1024 ? 3 : vw > 640 ? 2 : 1, pad = 8, gap = 8, rowGap = 40, phone = vw <= 640;
    const tw = (vw - pad * 2 - gap * (cols - 1)) / cols, th = tw * 9 / 16;
    // headline (letters resolve out of punctuation glyphs)
    const f1 = `500 16px ${SANS}`, f2 = `400 17px ${SERIF}`, a = "Every deal, settled ", b = "by evidence, not by trust";
    const hc = document.createElement("canvas"), hg = hc.getContext("2d")!, hw = Math.min(vw, 640), hh = phone ? 52 : 34;
    hc.width = hw * dpr(); hc.height = hh * dpr();
    const full = a + b; const rnd = Array.from(full, () => Math.random());
    const lines = phone ? [[a + "by evidence,", 0], ["not by trust", 1]] as const : [[full, 0]] as const; void lines;
    const draw = (p: number) => {
      hg.setTransform(1, 0, 0, 1, 0, 0); hg.clearRect(0, 0, hc.width, hc.height); hg.scale(dpr(), dpr()); hg.textBaseline = "middle"; hg.fillStyle = "#ededeb";
      const out = Array.from(full, (ch, i) => (ch === " " || p >= 1 || p > .7 * (i / full.length) + .3 * rnd[i]!) ? ch : GLYPHS[Math.floor(rnd[i]! * 1000 + p * 12) % GLYPHS.length]!);
      const seg1 = out.slice(0, a.length).join(""), seg2 = out.slice(a.length).join("");
      hg.font = f1; (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-0.16px"; const w1 = hg.measureText(seg1).width;
      hg.font = f2; (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; const w2 = hg.measureText(seg2).width;
      if (phone) { hg.font = f1; (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-0.16px"; const l1 = out.slice(0, a.length).join("").trim() + " " + out.slice(a.length, a.length + 0).join("");
        hg.textAlign = "center"; hg.fillText(l1, hw / 2, 12); hg.font = f2; (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; hg.fillText(seg2, hw / 2, 32); hg.textAlign = "left"; }
      else { const x0 = (hw - w1 - w2) / 2; hg.font = f1; (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-0.16px"; hg.fillText(seg1, x0, hh / 2); hg.font = f2; (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; hg.fillText(seg2, x0 + w1, hh / 2); }
    };
    const ht = toTex(hc); ht.generateMipmaps = false; ht.minFilter = THREE.LinearFilter;
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false, opacity: 0 }));
    hm.scale.set(hw, hh, 1); hm.position.set(vw / 2, -(200 + hh / 2), 0); content.add(hm);
    draw(0); ht.needsUpdate = true; headline = { mesh: hm, canvas: hc, tex: ht, draw: (p) => { draw(p); ht.needsUpdate = true; } };
    const gridTop = 200 + hh + 80;
    const src = sources(); key = src.map((s) => s.item.id).join("|");
    src.forEach((s, i) => {
      const col = i % cols, row = Math.floor(i / cols), x = pad + col * (tw + gap), y = gridTop + row * (th + 12 + 12 + 14 + 6 + 13 + rowGap);
      const still = toTex(s.kind === "new" ? newCard(s.item) : drawStill(s.item, true)), hover = toTex(s.kind === "new" ? newCard(s.item, true) : drawDetail(s.item));
      const mat = new THREE.ShaderMaterial({ vertexShader: TILE_V, fragmentShader: TILE_F, uniforms: { uTex: { value: still }, uTex2: { value: hover }, uMix: { value: 0 }, uReveal: { value: s.kind === "new" ? 1 : 0 }, uTime: timeU } });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.scale.set(tw, th, 1);
      // chip
      const idx = String(i + 1).padStart(2, "0"), { cc, cw, chh } = chipFor(`${idx}  ${s.item.category}`), ct = toTex(cc);
      const chipMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: TILE_V, fragmentShader: CHIP_F, uniforms: { uTex: { value: still }, uTex2: { value: hover }, uLabel: { value: ct }, uMix: mat.uniforms.uMix!, uReveal: mat.uniforms.uReveal!, uTile: { value: new THREE.Vector2(tw, th) }, uSize: { value: new THREE.Vector2(cw, chh) }, uRect: { value: new THREE.Vector4(8 / tw, 1 - (8 + chh) / th, cw / tw, chh / th) } } });
      const chip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), chipMat); chip.scale.set(cw, chh, 1);
      const title = textPlane(s.item.title, `500 12px ${SANS}`, "#ededeb"), cat = textPlane(`${s.item.category}, ${s.item.meta}`, `400 13px ${SERIF}`, "#8a8a88");
      [mesh, chip, title, cat].forEach((o) => { content.add(o); (o.material as THREE.Material).transparent = true; });
      const place = (dy = 0) => {
        mesh.position.set(x + tw / 2, -(y + th / 2) - dy, 0); chip.position.set(x + 8 + cw / 2, -(y + 8 + chh / 2) - dy, .1);
        const tw_ = title.scale.x, cw_ = cat.scale.x; title.position.set(x + tw_ / 2, -(y + th + 12 + title.scale.y / 2) - dy, 0); cat.position.set(x + cw_ / 2, -(y + th + 12 + title.scale.y + 6 + cat.scale.y / 2) - dy, 0);
      };
      place(); (mesh.userData as { place: (d: number) => void }).place = place;
      tiles.push({ item: s.item, kind: s.kind, mesh, chip, title, cat, still, hover, x, y, w: tw, h: th, mix: 0, reveal: s.kind === "new" ? 1 : 0, shown: false, col, row, idx, entered: false, lastMix: 0 });
      [chip, title, cat].forEach((o) => { (o.material as THREE.Material & { opacity: number }).opacity = 0; });
      mesh.visible = false;
    });
    const rows = Math.ceil(src.length / cols), lastBottom = gridTop + rows * (th + 12 + 12 + 14 + 6 + 13 + rowGap) - rowGap;
    const foot = textPlane("Handshake — Rialo devnet", `400 13px ${SERIF}`, "#8a8a88"); foot.position.set(vw / 2, -(lastBottom + 240), 0); content.add(foot);
    pageH = lastBottom + 240 + 80;
    scroll = target = clamp(scroll, 0, Math.max(0, pageH - vh));
    loadLive();
  }
  async function loadLive() {
    for (const t of tiles) {
      if (t.kind !== "deal" || !t.item.address) continue;
      const addr = t.item.address; let live: Awaited<ReturnType<typeof readDeal>> = null;
      try { live = await readDeal(client, addr); } catch { live = null; }
      if (!tiles.includes(t)) return; t.item.live = live;
      (t.still.image as HTMLCanvasElement) = drawStill(t.item, true); t.still.needsUpdate = true; (t.hover.image as HTMLCanvasElement) = drawDetail(t.item); t.hover.needsUpdate = true;
      const sw = stateWord(t.item); if (sw) setChip(t, `${t.idx}  ${sw}`);
      gsap.to(t, { reveal: 1, duration: .8, ease: "power2.out", onUpdate: () => { (t.mesh.material as THREE.ShaderMaterial).uniforms.uReveal!.value = t.reveal; } });
    }
  }
  function entrance() {
    const dly = (t: Tile) => .35 + .08 * t.col + .06 * t.row;
    if (headline) { const m = headline.mesh.material as THREE.MeshBasicMaterial; gsap.to(m, { opacity: 1, duration: .3 }); const o = { p: 0 }; if (reduced) headline.draw(1); else gsap.to(o, { p: 1, duration: 1.1, ease: "power2.out", onUpdate: () => headline!.draw(o.p) }); }
    tiles.forEach((t) => {
      t.mesh.visible = true; const place = (t.mesh.userData as { place: (d: number) => void }).place; const o = { dy: -60 };
      const parts = [t.chip, t.title, t.cat]; t.entered = false; gsap.delayedCall(dly(t) + (reduced ? 0 : 1.2), () => { t.entered = true; });
      gsap.to(o, { dy: 0, duration: reduced ? 0 : 1.2, ease: "expo.out", delay: dly(t), onUpdate: () => place(o.dy) });
      parts.forEach((p) => gsap.to(p.material as THREE.Material, { opacity: 1, duration: reduced ? 0 : .9, ease: "power2.out", delay: dly(t) }));
      gsap.fromTo(t.mesh.material, {}, {}); (t.mesh.material as THREE.ShaderMaterial).transparent = true;
    });
  }

  /* ---------- interaction ---------- */
  const tileAt = (cx: number, cy: number) => tiles.findIndex((t) => cx >= t.x && cx <= t.x + t.w && cy + scroll >= t.y && cy + scroll <= t.y + t.h);
  function setHover(i: number) {
    if (i === hoverIdx) return;
    if (hoverIdx >= 0 && tiles[hoverIdx]) { const t = tiles[hoverIdx]!; gsap.to(t, { mix: 0, duration: .45, ease: "power2.out" }); }
    hoverIdx = i;
    if (i >= 0) { gsap.to(tiles[i]!, { mix: 1, duration: .45, ease: "power2.out" }); gsap.fromTo(bubble, { scale: .6 }, { opacity: 1, scale: 1, duration: .75, ease: "power4.out" }); }
    else gsap.to(bubble, { opacity: 0, scale: .6, duration: .6, ease: "power4.out" });
  }
  function onMove(e: PointerEvent) {
    if (!running || vw <= 1024 || isTouch) return; const r = stage.getBoundingClientRect();
    qx(e.clientX); qy(e.clientY); setHover(tileAt(e.clientX - r.left, e.clientY - r.top));
    stage.style.cursor = hoverIdx >= 0 ? "pointer" : "";
  }
  function onClick(e: MouseEvent) {
    if (!running || Math.abs(clickDrag) > 8) return; const r = stage.getBoundingClientRect(); const i = tileAt(e.clientX - r.left, e.clientY - r.top);
    if (i < 0) return; const t = tiles[i]!; if (t.kind === "new") openNewDeal(() => { setTimeout(() => api.refresh?.(), 300); }); else location.hash = `deal/${t.item.address}`;
  }
  let clickDrag = 0;
  const onWheel = (e: WheelEvent) => { target = clamp(target + e.deltaY, 0, Math.max(0, pageH - vh)); };
  const onTS = (e: TouchEvent) => { touching = true; touchY = e.touches[0]!.clientY; vel = 0; clickDrag = 0; };
  const onTM = (e: TouchEvent) => { const y = e.touches[0]!.clientY, d = touchY - y; touchY = y; clickDrag += d; vel = d; target = clamp(target + d, 0, Math.max(0, pageH - vh)); };
  const onTE = () => { touching = false; };

  function frame(t: number) {
    raf = requestAnimationFrame(frame); if (!running) return;
    timeU.value = t / 1000;
    if (!touching && Math.abs(vel) > .1) { target = clamp(target + vel, 0, Math.max(0, pageH - vh)); vel *= .95; }
    scroll += (target - scroll) * .12; content.position.y = scroll;
    const compact = vw <= 1024 || isTouch;
    if (compact && tiles.length) { let best = 0, bd = 1e9; tiles.forEach((tt, i) => { const d = Math.abs(tt.y + tt.h / 2 - scroll - vh / 2); if (d < bd) (bd = d, (best = i)); }); tiles.forEach((tt, i) => { const m = i === best ? 1 : 0; tt.mix += (m - tt.mix) * .1; }); }
    tiles.forEach((tt) => { (tt.mesh.material as THREE.ShaderMaterial).uniforms.uMix!.value = tt.mix; if (tt.entered && Math.abs(tt.mix - tt.lastMix) > .002 && !compact) { tt.lastMix = tt.mix; (tt.mesh.userData as { place: (d: number) => void }).place(-tt.mix * 6); } });
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  function build() {
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(dpr()); renderer.setClearColor("#0c0c0d", 1); stage.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color("#0c0c0d"); scene.add(content);
    camera = new THREE.PerspectiveCamera(35, 1, 1, 8000);
    rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
    postScene = new THREE.Scene(); postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: TILE_V, fragmentShader: POST_F, uniforms: { tDiffuse: { value: rt.texture } } })); postScene.add(post);
    layout(); built = true;
    stage.addEventListener("wheel", onWheel, { passive: true }); stage.addEventListener("pointermove", onMove); stage.addEventListener("click", onClick);
    stage.addEventListener("touchstart", onTS, { passive: true }); stage.addEventListener("touchmove", onTM, { passive: true }); stage.addEventListener("touchend", onTE);
    stage.addEventListener("pointerleave", () => setHover(-1));
  }
  const api: View = {
    show() {
      if (!built) build(); else if (key !== sources().map((s) => s.item.id).join("|")) { layout(); firstShow = true; }
      running = true; if (!raf) raf = requestAnimationFrame(frame);
      if (firstShow) { firstShow = false; scroll = target = 0; entrance(); } else tiles.forEach((t) => { t.mesh.visible = true; });
      void root;
    },
    hide() { running = false; setHover(-1); cancelAnimationFrame(raf); raf = 0; },
    resize() { if (built) { layout(); firstShow = false; entrance(); } },
    refresh() { if (built && running) { const keep = target; layout(); target = scroll = clamp(keep, 0, Math.max(0, pageH - vh)); entrance(); } },
  };
  return api;
}
