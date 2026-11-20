import * as THREE from "three";
import { $, clamp, gsap, isTouch, reduced, SANS, SERIF, type View } from "../ui/core";

const REPO = "https://github.com/Siriron/handshake-rialo";
interface L { text: string; font: string; color: string; gap: number; link?: string; lh?: number }
interface B { pos: "top" | "bottom"; lines: L[]; width: number }
const HEAD = (t: string): L => ({ text: t, font: `500 12px ${SANS}`, color: "#8a8a88", gap: 0 });
const P = (t: string, font: string, gap = 0, color = "#ededeb", lh = 29): L => ({ text: t, font, color, gap, lh });

/** Real product content, from the repository and its recorded runs. */
function blocks(phone: boolean): B[] {
  const pw = phone ? Math.min(innerWidth - 56, 300) : 320;
  const para = (title: string, body: string, pos: B["pos"]): B => ({ pos, width: pw, lines: [HEAD(title), P(body, `300 22px ${SERIF}`, 16)] });
  const list = (title: string, items: string[], pos: B["pos"]): B => ({ pos, width: 260, lines: [HEAD(title), ...items.map((t, i) => P(t, `400 18px ${SERIF}`, i ? 7 : 16, "#ededeb", 24))] });
  const chapter = (kicker: string, num: string, body: string, pos: B["pos"]): B => ({ pos, width: 300, lines: [HEAD(kicker), P(num, `300 72px ${SERIF}`, 10, "#ededeb", 72), P(body, `300 19px ${SERIF}`, 6, "#ededeb", 26)] });
  const quote = (q: string, by: string, pos: B["pos"]): B => ({ pos, width: phone ? 300 : 440, lines: [P(q, `italic 300 ${phone ? 30 : 40}px ${SERIF}`, 0, "#ededeb", (phone ? 30 : 40) * 1.12), { ...HEAD(by), gap: 14 }] });
  const stats = (title: string, rows: string[], pos: B["pos"]): B => ({ pos, width: 260, lines: [HEAD(title), ...rows.map((t, i) => P(t, `400 18px ${SANS}`, i ? 9 : 16, "#ededeb", 24))] });
  return [
    para("How it works", "Fund up to four milestones. At each deadline validators check GitHub, and the program pays the seller or refunds you.", "top"),
    list("Evidence", ["Published release", "Merged pull request", "owner/repo@tag", "owner/repo#number"], "bottom"),
    chapter("Part One  ·  Funding", "I", "Money is held in the deal once it is funded. Nothing moves until a deadline or an approval.", "top"),
    quote("“Nobody has to press a button.”", "— How Handshake settles", "bottom"),
    stats("Verified on devnet", ["06  Live scenarios passed", "23  Core logic tests", "04  Milestones per deal", "10 s  Program heartbeat"], "top"),
    para("Limits", "Each milestone is at least 0.01 RLO. Deadlines are 60 seconds to 24 hours ahead, 30 seconds apart.", "bottom"),
    chapter("Part Two  ·  Settlement", "II", "At the deadline the verifier reports. The program pays the seller or refunds the buyer.", "top"),
    list("Not yet shown", ["Direct handler calls", "Forged report argument", "Stuck-check rescue", "Long-running deals"], "bottom"),
    quote("“Claims stop where the evidence stops.”", "— Evidence notes", "top"),
    { pos: "bottom", width: 280, lines: [HEAD("Source"),
      { text: "Code on GitHub →", font: `300 22px ${SERIF}`, color: "#ededeb", gap: 16, link: REPO, lh: 29 },
      { text: "Evidence and limits →", font: `300 22px ${SERIF}`, color: "#ededeb", gap: 8, link: `${REPO}/blob/main/docs/EVIDENCE.md`, lh: 29 },
      { text: "Open a deal →", font: `300 22px ${SERIF}`, color: "#ededeb", gap: 8, link: "#deals", lh: 29 }] },
  ];
}

interface Line { mesh: THREE.Mesh; w: number; h: number; x0: number; y0: number; shift: number; vis: B["pos"]; link?: string; op: number; k: number }
const GLSL_NOISE = `float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }`;

export function createAbout(): View {
  const stage = $("#aStage"), hint = $("#aHint");
  let built = false, running = false, raf = 0, visits = 0;
  let renderer!: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, rt: THREE.WebGLRenderTarget;
  let vw = 0, vh = 0, wpp = 0; // world units per CSS px at z -8
  const dpr = () => Math.min(devicePixelRatio, 2);
  const root = new THREE.Group(), textGroup = new THREE.Group();
  const lines: Line[] = []; let headline: { mesh: THREE.Mesh; w: number; x0: number } | null = null, foot: { mesh: THREE.Mesh; w: number; h: number; x0: number; shade: THREE.Mesh } | null = null;
  let L_ = 1000, offset = 0, target = 0, vel = 0, touching = false, tX = 0, tY = 0, scrolled = false;
  let blocksSpec: { lines: Line[]; pos: B["pos"] }[] = [];

  /* ---------- bot ---------- */
  const bot = new THREE.Group(), botRoot = new THREE.Group();
  const botU = { uReveal: { value: 0 }, uTime: { value: 0 }, uMinY: { value: -1.6 }, uMaxY: { value: 1.6 }, uInv: { value: new THREE.Matrix4() }, uHit: { value: new THREE.Vector3() }, uHover: { value: 0 } };
  const mats: THREE.Material[] = [];
  const inject = (m: THREE.Material) => {
    mats.push(m);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, botU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform mat4 uInv; varying vec3 vBot;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBot=(uInv*modelMatrix*vec4(transformed,1.)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform float uReveal,uTime,uMinY,uMaxY,uHover; uniform vec3 uHit; varying vec3 vBot;\n${GLSL_NOISE}`)
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
 { float band=.97; float front=mix(uMinY-band,uMaxY+.25*band,uReveal); float wave=(vnoise(vec3(vBot.x*2.2,vBot.z*2.2,uTime*.5))-.5)*.95*(1.-uReveal)*2.;
   float edge=front+wave; if(vBot.y>edge) discard;
   float below=edge-vBot.y; float inBand=(1.-smoothstep(0.,band,below))*(1.-uReveal);
   vec3 liquid=mix(gl_FragColor.rgb*1.25,vec3(.56,.63,1.),.55); gl_FragColor.rgb=mix(gl_FragColor.rgb,liquid,inBand);
   float men=pow(1.-clamp(below/(band*.14),0.,1.),3.)*1.4*(1.-uReveal); gl_FragColor.rgb+=vec3(.086,.129,1.)*men*(.7+.3*sin(uTime*6.+vBot.x*8.));
   float g=pow(clamp(1.-distance(vBot,uHit)/1.09,0.,1.),3.)*.4*uHover; gl_FragColor.rgb+=vec3(.086,.129,1.)*g; }`);
    };
  };
  const chrome = () => { const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: .07 }); inject(m); return m; };
  const visorMat = () => { const m = new THREE.MeshPhysicalMaterial({ color: 0x040405, metalness: .3, roughness: .12, clearcoat: 1, clearcoatRoughness: .04 }); inject(m); return m; };
  const eyes: THREE.Mesh[] = []; let halo!: THREE.Group; let head!: THREE.Mesh;
  function buildBot() {
    const ch = chrome(), vm = visorMat();
    head = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), ch); head.scale.set(1.1, 1, .98); bot.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32, Math.PI / 2 - 1.02, 2.04, Math.PI / 2 - .5, 1), vm); visor.scale.set(1.1 * 1.015, 1.015, .98 * 1.015); bot.add(visor);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee }); inject(eyeMat);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .2, 8, 16), eyeMat); const x = .3 * sx, y = .03; const z = .98 * 1.015 * Math.sqrt(Math.max(0, 1 - (x / 1.1) ** 2 - y * y)); e.position.set(x, y, z); e.scale.set(1, 1, .45); bot.add(e); eyes.push(e); }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.022, .03, .42, 16), ch); stem.position.y = 1.15; bot.add(stem);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.095, 24, 16), ch); ball.position.y = 1.38; bot.add(ball);
    for (const sx of [-1, 1]) {
      const tor = new THREE.Mesh(new THREE.TorusGeometry(.2, .065, 24, 48), ch); tor.rotation.y = Math.PI / 2; tor.position.x = 1.1 * sx; bot.add(tor);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .05, 32), vm); cap.rotation.z = Math.PI / 2; cap.position.x = 1.1 * sx - .03 * sx; bot.add(cap);
    }
    halo = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(.78, .05, 24, 64), ch); ring.rotation.x = .92 * Math.PI / 2; halo.add(ring); halo.position.y = -1.28; bot.add(halo);
    const box = new THREE.Box3().setFromObject(bot), c = box.getCenter(new THREE.Vector3()); bot.position.sub(c);
    botU.uMinY.value = box.min.y - c.y; botU.uMaxY.value = box.max.y - c.y; (botRoot.userData as { H: number }).H = box.max.y - box.min.y;
    botRoot.add(bot); botRoot.position.z = -1; scene.add(botRoot);
  }
  function envMap() {
    const room = new THREE.Scene(), bg = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({ color: 0x0a0a0b, side: THREE.BackSide })); room.add(bg);
    const panel = (w: number, h: number, i: number, pos: [number, number, number], rot: [number, number, number]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(i), side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); room.add(m); };
    panel(14, 5, 1.1, [0, 6, 0], [Math.PI / 2, 0, 0]); panel(3.2, 10, 1.0, [-6, 0, 0], [0, Math.PI / 2, 0]); panel(2.4, 10, .85, [6, 0, 0], [0, Math.PI / 2, 0]);
    panel(12, 2.2, .6, [0, -1.5, -6], [0, 0, 0]); panel(5, 4, .8, [3, 2.5, 6], [0, Math.PI, 0]); panel(14, 6, .22, [0, -6, 0], [Math.PI / 2, 0, 0]);
    const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(room, .02).texture; pm.dispose(); return tex;
  }

  /* ---------- lens burst ---------- */
  let disc!: THREE.Mesh; const lensU = { uBg: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uR: { value: 1 }, uDis: { value: 0 } };
  function buildDisc() {
    disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: lensU,
      vertexShader: "void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
      fragmentShader: `uniform sampler2D uBg; uniform vec2 uRes,uCenter; uniform float uR,uDis;
 float gs(float x,float c,float s){ return exp(-pow((x-c)/s,2.)); }
 void main(){ vec2 fc=gl_FragCoord.xy; vec2 d=fc-uCenter; float nd=length(d)/uR; if(nd>1.) discard;
  float dist=1.-min(uDis/.8,1.); float lightF=1.-min(uDis/.6,1.); float alpha=1.-smoothstep(.8,1.,uDis);
  vec2 uv=fc/uRes, cuv=uCenter/uRes; vec2 dir=normalize(d+1e-4);
  float pull=(.5*.30*nd*nd+smoothstep(.85,1.,nd)*.2344)*dist;
  vec2 base=cuv+(uv-cuv)*(1.-pull); float disp=1.64*.004*smoothstep(.6,1.,nd)*dist; vec3 acc=vec3(0.),ws=vec3(0.);
  for(int i=0;i<8;i++){ float s=float(i)/7.; vec2 o=dir*(s-.5)*disp*2.; vec3 w=vec3(gs(s,.15,.35),gs(s,.5,.35),gs(s,.85,.35)); acc+=texture2D(uBg,clamp(base+o,0.,1.)).rgb*w; ws+=w; }
  vec3 col=acc/ws; float r=nd*.5;
  float nova=exp(-nd*nd*4.*1.)*.2122*lightF; col+=vec3(1.)*nova;
  float ring=exp(-pow((r-.49)/.08,2.))*(.9*11./17.*1.8)*lightF; float aura=exp(-pow((r-.49)/.2,2.))*.25*lightF; col+=vec3(.145,.169,.655)*(ring+aura);
  col+=vec3(1.)*exp(-pow((r-.483)/.012,2.))*.7*lightF; col+=vec3(.145,.169,.655)*exp(-pow((r-.478)/.06,2.))*1.053*lightF*.5;
  gl_FragColor=vec4(col,alpha);
  #include <colorspace_fragment>
 }` }));
    disc.position.z = -7.99; disc.scale.setScalar(0); disc.renderOrder = 5; disc.visible = false; scene.add(disc);
  }
  let lensing = false, busy = false, reveal = 0;
  const pose = { rx: 0, ry: 0, rz: 0, shake: 0, spin: 0, squash: 1 };
  const cur = { x: 0, y: 0, z: 0 }, tgt = { x: reduced || isTouch ? 0 : -.62, y: reduced || isTouch ? 0 : .59, z: reduced || isTouch ? 0 : .2 };
  const fl = { phase: 0, speed: 1, amp: 1 }, eyeY = { v: 1 };
  let asleep = false, idleT: ReturnType<typeof setTimeout> | null = null, blinkT: ReturnType<typeof setTimeout> | null = null, moved = false, reactionToggle = false;
  const doShake = () => { gsap.timeline().to(pose, { shake: .22, duration: .09 }).to(pose, { shake: -.18, duration: .12 }).to(pose, { shake: .1, duration: .11 }).to(pose, { shake: 0, duration: .18 }); };
  const blink = () => { gsap.to(eyeY, { v: .1, duration: .09, yoyo: true, repeat: 1, overwrite: true }); blinkT = setTimeout(blink, 3000 + Math.random() * 2000); };
  function sleep() { if (isTouch || reveal < 1 || asleep) return; asleep = true; if (blinkT) clearTimeout(blinkT); gsap.to(eyeY, { v: .2, duration: 1.1, ease: "power2.inOut", overwrite: true }); gsap.to(tgt, { x: .42, y: 0, z: .12, duration: 1.4 }); gsap.to(fl, { speed: .35, amp: 1.6, duration: 1.6 }); }
  function wake() { if (idleT) clearTimeout(idleT); idleT = setTimeout(sleep, 30000); if (!asleep) return; asleep = false; gsap.to(fl, { speed: 1, amp: 1, duration: .8 }); gsap.killTweensOf(eyeY); eyeY.v = 1; blinkT = setTimeout(blink, 3000); doShake(); }

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
  const hitBot = () => { raycaster.setFromCamera(ndc, camera); return raycaster.intersectObject(head, false)[0]; };
  function burst() {
    if (busy || reveal < .8) return; busy = true; lensing = true; disc.visible = true; lensU.uDis.value = 0;
    const s = { v: 0 }; let dissolving = false; const worldPerPxAt = () => (2 * 21 * Math.tan(22.5 * Math.PI / 180)) / vh;
    gsap.to(s, { v: 10, duration: 4, ease: "expo.out", onUpdate: () => { disc.scale.setScalar(s.v); lensU.uR.value = (s.v / worldPerPxAt()) * dpr();
      if (!dissolving && s.v > 6.14) { dissolving = true; gsap.to(lensU.uDis, { value: 1, duration: .8975, ease: "sine.inOut", onComplete: () => { disc.visible = false; lensing = false; busy = false; disc.scale.setScalar(0); } }); } } });
    reactionToggle = !reactionToggle; const tl = gsap.timeline();
    if (reactionToggle) tl.to(pose, { rx: -.45, ry: .18, squash: .1, duration: .16, ease: "power3.out" }).to(pose, { rx: 0, ry: 0, squash: 1, duration: .9, ease: "elastic.out(1, .45)" });
    else tl.to(pose, { spin: Math.PI * 2, duration: 1.1, ease: "power3.inOut" }).set(pose, { spin: 0 }).fromTo(pose, { rz: .25 }, { rz: 0, duration: 1, ease: "elastic.out(1, .5)" }, "<");
    tl.add(doShake, reactionToggle ? ">-0.3" : ">-0.5");
  }

  /* ---------- text ---------- */
  function lineTex(text: string, font: string, color: string) {
    const t = document.createElement("canvas").getContext("2d")!; t.font = font; const w = Math.ceil(t.measureText(text).width) + 4, px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "16"), h = Math.ceil(px * 1.4) + 2;
    const c = document.createElement("canvas"); c.width = Math.ceil(w * dpr()); c.height = Math.ceil(h * dpr()); const g = c.getContext("2d", { willReadFrequently: true })!; g.scale(dpr(), dpr()); g.font = font; g.fillStyle = color; g.textBaseline = "middle"; g.fillText(text, 2, h / 2 + px * .04);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); mesh.scale.set(w * wpp, h * wpp, 1); mesh.position.z = -8; textGroup.add(mesh);
    return { mesh, w, h };
  }
  function wrapText(text: string, font: string, maxW: number): string[] {
    const g = document.createElement("canvas").getContext("2d")!; g.font = font; const out: string[] = []; let cur = "";
    for (const w of text.split(" ")) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out;
  }
  function buildText() {
    textGroup.clear(); lines.length = 0; blocksSpec = []; headline = null; foot = null;
    const phone = vw <= 640, tab = vw <= 1024;
    // headline canvas
    const hf = phone ? 62 : 75, texts = ["Milestones that pay out", "when the evidence is on GitHub,", "checked by Rialo validators."];
    const g0 = document.createElement("canvas").getContext("2d")!; g0.font = `300 ${hf}px ${SERIF}`;
    let size = hf; const widest = () => Math.max(...texts.map((t) => g0.measureText(t).width));
    if (tab) { while (size > 24 && widest() > vw - 40) { size -= 2; g0.font = `300 ${size}px ${SERIF}`; } }
    const wrapW = vw - 40; const tl: string[] = []; for (const t of texts) tl.push(...(g0.measureText(t).width > wrapW ? wrapText(t, `300 ${size}px ${SERIF}`, wrapW) : [t]));
    const lhH = size * 1.18, total = tl.length * lhH;
    const hc = document.createElement("canvas"); hc.width = Math.ceil(vw * dpr()); hc.height = Math.ceil(vh * dpr()); const hg = hc.getContext("2d", { willReadFrequently: true })!; hg.scale(dpr(), dpr()); hg.fillStyle = "#ededeb"; hg.textBaseline = "middle"; hg.textAlign = "center";
    (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-.01 * size}px`; hg.font = `300 ${size}px ${SERIF}`;
    const y0 = vh / 2 - total / 2 + lhH / 2; tl.forEach((t, i) => hg.fillText(t, vw / 2, y0 + i * lhH));
    const ft = phone ? 12 : 14, fy = y0 + (tl.length - 1) * lhH + lhH / 2 + 56;
    (hg as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; hg.font = `500 ${ft}px ${SANS}`; hg.fillStyle = "#8a8a88"; const a = "Live on ", b = "Rialo devnet"; const wa = hg.measureText(a).width, wb = hg.measureText(b).width;
    hg.textAlign = "left"; hg.fillText(a, vw / 2 - (wa + wb) / 2, fy); hg.fillStyle = "#ededeb"; hg.fillText(b, vw / 2 - (wa + wb) / 2 + wa, fy);
    const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace; ht.minFilter = THREE.LinearFilter; ht.generateMipmaps = false;
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false })); hm.scale.set(vw * wpp, vh * wpp, 1); hm.position.z = -8; textGroup.add(hm);
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0c0c0d, transparent: true, opacity: 0, depthWrite: false })); shade.scale.set((wb + 12) * wpp, (ft + 14) * wpp, 1); shade.position.z = -7.98; textGroup.add(shade);
    headline = { mesh: hm, w: vw, x0: 0 }; foot = { mesh: hm, w: wb, h: ft, x0: (wa - wb) / 2 + (wa + wb) / 2 - (wa + wb) / 2 + 0, shade };
    (foot as unknown as { fy: number; cx: number }).fy = fy; (foot as unknown as { fy: number; cx: number }).cx = vw / 2 - (wa + wb) / 2 + wa + wb / 2;
    // track
    let x = vw / 2 + (phone ? 70 : 200); const centre = 0, band = phone ? 64 : 78; let end = x;
    for (const spec of blocks(phone)) {
      const rows: { text: string; font: string; color: string; gap: number; lh: number; link?: string }[] = [];
      for (const l of spec.lines) {
        const ws = l.font.includes("19px") || l.font.includes("22px") && l.lh === 29 && !l.link || l.font.includes("40px") || l.font.includes("30px") ? wrapText(l.text, l.font, spec.width) : [l.text];
        ws.forEach((t, k) => rows.push({ text: t, font: l.font, color: l.color, gap: k ? 0 : l.gap, lh: l.lh ?? 24, link: l.link }));
      }
      const H = rows.reduce((n, r, i) => n + r.gap * (i ? 1 : 0) + r.lh, 0); let cy = spec.pos === "top" ? band + H : -band;
      const bl: Line[] = []; let maxW = 0; let first = true;
      for (const r of rows) {
        if (!first) cy -= r.gap; first = false; const t = lineTex(r.text, r.font, r.color); const top = cy; cy -= r.lh;
        const ln: Line = { mesh: t.mesh, w: t.w, h: t.h, x0: x, y0: top - r.lh / 2, shift: 0, vis: spec.pos, link: r.link, op: 1, k: 0 }; bl.push(ln); lines.push(ln); maxW = Math.max(maxW, t.w);
      }
      void centre; blocksSpec.push({ lines: bl, pos: spec.pos });
      end = x + maxW; x += Math.max(.62 * maxW, phone ? 150 : 200) + (phone ? 60 : 90);
    }
    L_ = end + (phone ? 140 : 260) + vw / 2;
  }

  const wrapX = (px: number) => ((px + L_ / 2) % L_ + L_) % L_ - L_ / 2;
  function updateText(dt: number) {
    const rx = 3.4 * (vw <= 640 ? .7875 : 1), ry = 4.0543 * (vw <= 640 ? .7875 : 1), pad = .35;
    if (headline) headline.mesh.position.x = wrapX(-offset) * wpp;
    if (foot) { const cx = ((foot as unknown as { cx: number }).cx - vw / 2); foot.shade.position.set(wrapX(-offset + cx) * wpp, -((foot as unknown as { fy: number }).fy - vh / 2) * wpp, -7.98); }
    for (const b of blocksSpec) {
      const order = b.lines.map((l) => ({ l, d: Math.abs(l.y0) })).sort((a, c) => a.d - c.d).map((o) => o.l); let prevShift = 0;
      order.forEach((l, k) => {
        const xl = wrapX(l.x0 - offset), xr = xl + l.w, xw = (xl) * wpp, xrw = xr * wpp, dx = xw <= 0 && xrw >= 0 ? 0 : Math.min(Math.abs(xw), Math.abs(xrw));
        let need = 0;
        if (dx < rx) { const h = ry * Math.sqrt(1 - (dx / rx) ** 2) + pad; if (b.pos === "top") { const bottom = (l.y0 - l.h / 2) * wpp; need = Math.max(0, h - bottom); } else { const topE = (l.y0 + l.h / 2) * wpp; need = -Math.max(0, topE + h); } }
        if (k > 0) need = b.pos === "top" ? Math.max(need, prevShift) : Math.min(need, prevShift);
        const f = Math.max(.1, .14 - .012 * k), a = 1 - Math.pow(1 - f, 60 * dt); l.shift += (need - l.shift) * a; prevShift = l.shift;
        l.mesh.position.set((xl + l.w / 2) * wpp, l.y0 * wpp + l.shift, -8);
      });
    }
  }

  /* ---------- frame ---------- */
  const clock = new THREE.Clock(); let lastClientX = 0, lastClientY = 0, hoverFoot = false, hoverLink: Line | null = null;
  function frame() {
    raf = requestAnimationFrame(frame); if (!running) return; const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    if (!touching && Math.abs(vel) > .05) { target += vel; vel *= .95; } offset += (target - offset) * .12;
    updateText(dt);
    const k = 1 - Math.pow(1 - .08, 60 * dt);
    cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k; cur.z += (tgt.z - cur.z) * k;
    fl.phase += dt * 1.5 * fl.speed; const fy = reduced ? 0 : Math.sin(fl.phase) * .2 * fl.amp * reveal;
    bot.rotation.set(cur.x + pose.rx, cur.y + pose.ry + pose.shake + pose.spin, cur.z + pose.rz);
    botRoot.position.y = fy; halo.rotation.y += dt * .35; eyes.forEach((e) => { e.scale.y = eyeY.v * pose.squash; });
    botRoot.updateMatrixWorld(true); botU.uInv.value.copy(botRoot.matrixWorld).invert(); botU.uReveal.value = reveal; botU.uTime.value = t;
    const hit = hitBot(); if (hit && reveal > .5) { botU.uHit.value.copy(bot.worldToLocal(hit.point.clone())); botRoot.worldToLocal(botU.uHit.value.set(hit.point.x, hit.point.y, hit.point.z)); botU.uHover.value += (1 - botU.uHover.value) * .1; stage.style.cursor = reveal >= .8 ? "pointer" : ""; } else { botU.uHover.value += (0 - botU.uHover.value) * .05; stage.style.cursor = hoverLink || hoverFoot ? "pointer" : ""; }
    if (lensing) { disc.visible = false; bot.visible = false; renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); bot.visible = true; disc.visible = true; lensU.uBg.value = rt.texture; lensU.uRes.value.set(vw * dpr(), vh * dpr()); lensU.uCenter.value.set(vw * dpr() / 2, vh * dpr() / 2); }
    renderer.render(scene, camera);
  }
  function placeBot() { const s = (200 * (vw <= 1024 ? .85 : vw <= 1440 ? .9 : 1)) * ((2 * 14 * Math.tan(22.5 * Math.PI / 180)) / vh) / (botRoot.userData as { H: number }).H; botRoot.scale.setScalar(s); }
  function layout() {
    vw = stage.clientWidth; vh = stage.clientHeight; wpp = (2 * 21 * Math.tan(22.5 * Math.PI / 180)) / vh;
    renderer.setSize(vw, vh, false); camera.aspect = vw / vh; camera.updateProjectionMatrix(); rt.setSize(vw * dpr(), vh * dpr()); placeBot(); buildText();
  }
  function build() {
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(dpr()); renderer.setClearColor("#0c0c0d", 1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; stage.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color("#0c0c0d"); scene.environment = envMap(); scene.add(textGroup, root);
    camera = new THREE.PerspectiveCamera(45, 1, .1, 100); camera.position.z = 13; rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    buildBot(); buildDisc(); layout(); built = true;
    const pos = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); lastClientX = e.clientX - r.left; lastClientY = e.clientY - r.top; };
    stage.addEventListener("pointermove", (e) => {
      pos(e); wake(); moved = true; if (!isTouch && !reduced) { const nx = (lastClientX - vw / 2) / (vw / 2), ny = (lastClientY - vh / 2) / (vh / 2); tgt.x = clamp(ny, -.62, .62) * 1; tgt.y = clamp(nx, -.59, .59); tgt.z = .2 * nx; }
      hoverLink = lines.find((l) => l.link && Math.abs(lastClientX - (vw / 2 + l.mesh.position.x / wpp)) < l.w / 2 && Math.abs(lastClientY - (vh / 2 - l.mesh.position.y / wpp)) < l.h / 2) ?? null;
      lines.forEach((l) => { const want = l.link && l === hoverLink ? .5 : 1; if (l.op !== want) { l.op = want; gsap.to((l.mesh.material as THREE.MeshBasicMaterial), { opacity: want, duration: .55 }); } });
      if (foot) { const fy = (foot as unknown as { fy: number; cx: number }).fy, cx = (foot as unknown as { fy: number; cx: number }).cx; const over = Math.abs(lastClientX - (cx - offset)) < foot.w / 2 + 6 && Math.abs(lastClientY - fy) < 12; if (over !== hoverFoot) { hoverFoot = over; gsap.to((foot.shade.material as THREE.MeshBasicMaterial), { opacity: over ? .5 : 0, duration: .55, ease: "expo.out" }); } }
    });
    stage.addEventListener("pointerdown", () => { wake(); });
    stage.addEventListener("click", () => { if (hoverLink?.link) { const u = hoverLink.link; if (u.startsWith("#")) location.hash = u; else open(u, "_blank", "noopener"); return; } if (hitBot()) burst(); });
    stage.addEventListener("wheel", (e) => { wake(); const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; target += d; firstScroll(); }, { passive: true });
    stage.addEventListener("touchstart", (e) => { touching = true; vel = 0; tX = e.touches[0]!.clientX; tY = e.touches[0]!.clientY; wake(); }, { passive: true });
    stage.addEventListener("touchmove", (e) => { const x = e.touches[0]!.clientX, y = e.touches[0]!.clientY, dx = tX - x, dy = tY - y; tX = x; tY = y; const d = Math.abs(dx) > Math.abs(dy) ? dx : dy; target += d; vel = d; firstScroll(); }, { passive: true });
    stage.addEventListener("touchend", () => { touching = false; });
    for (const ev of ["wheel", "keydown", "touchstart"]) addEventListener(ev, wake, { passive: true });
  }
  function firstScroll() { if (scrolled) return; scrolled = true; gsap.to(hint, { opacity: 0, duration: .4 }); }
  return {
    show() {
      if (!built) build(); visits++; running = true; if (!raf) { clock.start(); frame(); }
      reveal = reduced ? 1 : 0; const o = { v: reveal }; if (!reduced) gsap.to(o, { v: 1, duration: 3.85, ease: "power2.out", delay: visits === 1 ? 1 : .45, onUpdate: () => { reveal = o.v; } });
      blinkT = setTimeout(blink, 3000 + Math.random() * 2000); wake(); void moved;
      if (!scrolled) gsap.fromTo(hint, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: .9, ease: "expo.out", delay: 1.6 });
    },
    hide() { running = false; cancelAnimationFrame(raf); raf = 0; if (blinkT) clearTimeout(blinkT); if (idleT) clearTimeout(idleT); },
    resize() { if (built) layout(); },
  };
}
