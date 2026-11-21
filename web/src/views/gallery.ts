import * as THREE from "three";
import { $, gsap, isTouch, reduced, SANS, type View } from "../ui/core";
import { RULES, VERIFIED_DEALS, dealItem, type Item } from "../data";
import { drawStill } from "../ui/cards";
import { client } from "../session";
import { readDeal } from "../lib/rialo/chain";
import { openDeal } from "../ui/panels";

const FOV = 60, CAM_Z = 12;
export function createGallery(onReady: () => void): View {
  const root = $("#gallery"), stage = $("#gStage");
  let built = false, running = false, introDone = false, raf = 0, firstVisit = true;
  const items: Item[] = [...RULES, ...VERIFIED_DEALS.map((d) => dealItem(d.address, d.label))];
  const N = items.length; // 20
  let renderer!: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, group: THREE.Group;
  const planes: THREE.Mesh[] = [], base: THREE.Vector3[] = [];
  let vw = 0, vh = 0, unit = 0;
  const px = (v: number) => v * unit;
  const cfg = () => {
    // Spec sizes (104 / 250 px) are tuned for video previews. These cards carry text, so desktop is scaled 1.45x.
    const w = innerWidth, mid = w > 1024 && w <= 1440, k = (mid ? 0.8 : 1) * 1.45;
    const plane = w <= 640 ? 104 : 104 * k;
    return { r: 250 * k, plane, center: plane * 120 / 82, phone: w <= 640 };
  };
  let loaded = 0;
  const loadedCount = () => loaded;
  const state = { exp: 0, ov: 0, sel: -1, hover: -1 };
  const vel = { x: 0, y: 0 }, target = { x: 0, y: 0 }, smooth = { x: 0, y: 0 };
  let userTouched = reduced, dragging = false, moved = 0, path = 0, down = { x: 0, y: 0 }, last = { x: 0, y: 0 }, pending = false, ptr = { x: 0, y: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
  const label = $("#cursorLabel");
  const qx = gsap.quickTo(label, "x", { duration: .5, ease: "power3.out" }), qy = gsap.quickTo(label, "y", { duration: .5, ease: "power3.out" });

  function layout() {
    vw = stage.clientWidth; vh = stage.clientHeight;
    unit = (2 * CAM_Z * Math.tan((FOV / 2) * Math.PI / 180)) / vh;
    renderer.setSize(vw, vh, false); camera.aspect = vw / vh; camera.updateProjectionMatrix();
    const c = cfg();
    base.length = 0;
    for (let i = 0; i < N; i++) {
      const y = i * (2 / N) - 1 + 1 / N, r = Math.sqrt(1 - y * y), a = Math.PI * (3 - Math.sqrt(5)) * i;
      const Rx = c.phone ? vw / 2 - 24 - c.plane / 2 : c.r, Ry = c.phone ? Math.min(vh * .3, Rx * 1.55) : c.r; // phones are tall: stretch the sphere vertically so cards overlap less
      base.push(new THREE.Vector3(Math.cos(a) * r * Rx, y * Ry, Math.sin(a) * r * Rx).multiplyScalar(unit));
    }
  }
  const setScale = (m: THREE.Mesh, longerPx: number): void => { m.scale.set(px(longerPx), px(longerPx) * 9 / 16, 1); };

  function build() {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isTouch });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); stage.appendChild(renderer.domElement);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(FOV, 1, .1, 100); camera.position.z = CAM_Z;
    group = new THREE.Group(); scene.add(group);
    const geo = new THREE.PlaneGeometry(1, 1);
    items.forEach((it, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1b1b1d, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.userData = { item: it, loaded: false, i };
      group.add(m); planes.push(m);
    });
    layout();
    addEventListener("resize", onResize);
    stage.addEventListener("pointerdown", onDown); addEventListener("pointermove", onMove); addEventListener("pointerup", onUp);
    stage.addEventListener("wheel", onWheel, { passive: true });
    stage.addEventListener("pointerleave", () => { ndc.set(9, 9); state.hover = -1; setCaption(null); });
    $("#ovClose").addEventListener("click", collapse);
    addEventListener("keydown", (e) => { if (e.key === "Escape" && running) collapse(); });
    // draw card textures progressively so the intro counter reflects real progress
    const loadOne = () => {
      if (loaded >= N) return;
      const m = planes[loaded]!, c = drawStill(items[loaded]!); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      (m.material as THREE.MeshBasicMaterial).map = t; (m.material as THREE.MeshBasicMaterial).color.set("#ffffff"); (m.material as THREE.MeshBasicMaterial).needsUpdate = true;
      m.userData.loaded = true; loaded++; setTimeout(loadOne, 55);
    };
    setTimeout(loadOne, 200);
    // live deal cards
    VERIFIED_DEALS.forEach(async (d, k) => {
      const idx = N - VERIFIED_DEALS.length + k;
      try { const r = await readDeal(client, d.address); items[idx]!.live = r; } catch { items[idx]!.live = undefined; }
      const wait = () => { if (!planes[idx]!.userData.loaded) return setTimeout(wait, 200); const t = (planes[idx]!.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture; t.image = drawStill(items[idx]!); t.needsUpdate = true; };
      wait();
    });
    built = true;
  }

  /* ---------- intro ---------- */
  function drawWordmark() {
    const c = document.createElement("canvas"), g = c.getContext("2d")!; const s = 2;
    g.font = `600 64px ${SANS}`; const w = Math.ceil(g.measureText("Handshake").width) + 8; c.width = w * s; c.height = 90 * s;
    g.scale(s, s); g.font = `600 64px ${SANS}`; g.fillStyle = "#ededeb"; g.textBaseline = "middle"; g.letterSpacing = "-1.3px"; g.fillText("Handshake", 4, 46);
    const el = $("#gMark"); el.innerHTML = ""; el.style.width = "180px"; el.appendChild(c);
  }
  function intro() {
    const c = cfg(), mark = $("#gMark"), count = $("#gCount span"), sides = Array.from(root.querySelectorAll<HTMLElement>(".g-side span"));
    drawWordmark();
    planes.forEach((m, i) => { m.visible = i < 10; (m.material as THREE.MeshBasicMaterial).opacity = 0; m.scale.set(.0001, .0001, 1); });
    const circleR = px(c.phone ? 240 * .75 : 240); let spin = 0, spinMul = 1, circleAng = 0, collapsing = false;
    const circlePos = (i: number, a: number) => { const t = (-90 + i * 36) * Math.PI / 180 + a; return new THREE.Vector3(Math.cos(t) * circleR, Math.sin(t) * circleR * -1, 0); };
    gsap.fromTo(mark, { opacity: 0 }, { opacity: 1, duration: .6, delay: .2 });
    gsap.fromTo(sides, { yPercent: 100 }, { yPercent: 0, duration: .9, ease: "expo.out", stagger: .07, delay: .5 });
    const cn = { v: 1 }; gsap.fromTo(count, { yPercent: 110 }, { yPercent: 0, duration: .75, ease: "power4.out", delay: .5 });
    const fmt = (n: number) => String(Math.round(n)).padStart(3, "0");
    const tickCount = setInterval(() => gsap.to(cn, { v: Math.min(99, Math.max(1, (loadedCount() / N) * 99)), duration: .5, ease: "power1.out", onUpdate: () => { count.textContent = fmt(cn.v); } }), 120);
    const startedAt = performance.now();
    const t0 = performance.now(); void t0;
    const circleTick = () => {
      if (collapsing) return;
      circleAng += spin * (0.5 * Math.PI / 180) * spinMul;
      for (let i = 0; i < 10; i++) planes[i]!.position.copy(circlePos(i, circleAng));
    };
    gsap.ticker.add(circleTick);
    const begin = () => {
      const ready = loadedCount() >= 10 || performance.now() - startedAt > 30000;
      if (!ready || performance.now() - startedAt < 2000) return setTimeout(begin, 100);
      clearInterval(tickCount);
      gsap.to(cn, { v: 100, duration: .5, ease: "power1.out", onUpdate: () => { count.textContent = fmt(cn.v); } });
      gsap.to(count, { yPercent: -110, duration: .6, ease: "power3.in", delay: .55 });
      spin = 1;
      for (let i = 0; i < 10; i++) {
        const m = planes[i]!, mat = m.material as THREE.MeshBasicMaterial; m.position.copy(circlePos(i, 0));
        gsap.to(mat, { opacity: 1, duration: 1, ease: "power3.out", delay: i * .1 });
        const s = { v: .01 }; gsap.to(s, { v: 70, duration: 1, ease: "back.out(1.7)", delay: i * .1, onUpdate: () => setScale(m, s.v) });
      }
      gsap.delayedCall(1.3, () => { const o = { v: 1 }; gsap.to(o, { v: 7.3, duration: 1, ease: "power2.in", onUpdate: () => { spinMul = o.v; } }); });
      gsap.delayedCall(1.3 + 1 + .8, collapse);
    };
    const collapse = () => {
      collapsing = true;
      gsap.to(mark, { opacity: 0, duration: .75, ease: "power2.inOut" });
      gsap.to(sides, { yPercent: -110, duration: .6, ease: "power2.in" });
      planes.slice(0, 10).forEach((m, i) => {
        gsap.to(m.position, { x: 0, y: 0, z: px(-1.5 * i), duration: 1.25, ease: "power2.inOut", delay: i * .05 });
        const s = { v: 70 }; gsap.to(s, { v: c.center, duration: 1.25, ease: "power2.inOut", delay: i * .05, onUpdate: () => setScale(m, s.v) });
      });
      gsap.delayedCall(1.25 + 9 * .05 + .2, explode);
    };
    const explode = () => {
      gsap.ticker.remove(circleTick); mark.style.display = "none";
      planes.forEach((m, i) => {
        m.visible = true; const mat = m.material as THREE.MeshBasicMaterial, from = i < 10 ? m.position.clone() : new THREE.Vector3(0, 0, px(-1.5 * i));
        if (i >= 10) { m.position.copy(from); setScale(m, c.center); gsap.to(mat, { opacity: 1, duration: .3 }); }
        const s0 = i < 10 ? c.center : c.center, o = { t: 0 };
        gsap.to(o, { t: 1, duration: 1, ease: "power3.out", onUpdate: () => {
          m.position.copy(from).lerp(base[i]!, o.t).multiplyScalar(1 + .1 * Math.sin(Math.PI * o.t));
          setScale(m, s0 + (c.plane - s0) * o.t);
        }, onComplete: () => { m.position.copy(base[i]!); setScale(m, c.plane); } });
      });
      gsap.fromTo(sides, { yPercent: 100 }, { yPercent: 0, duration: .9, ease: "expo.out", stagger: .07 });
      gsap.to("#gHint", { opacity: 1, duration: 1, delay: .6 });
      onReady(); introDone = true;
    };
    setTimeout(begin, 200);
  }
  function showFinished() {
    planes.forEach((m, i) => { m.visible = true; (m.material as THREE.MeshBasicMaterial).opacity = 1; m.position.copy(base[i]!); setScale(m, cfg().plane); });
    $("#gMark").style.display = "none"; $("#gCount").style.display = "none"; gsap.set("#gHint", { opacity: 1 }); introDone = true; onReady();
  }

  /* ---------- interaction ---------- */
  const setCaption = (it: Item | null) => {
    const cap = $("#gCaption"), t = cap.querySelector(".t")!, c = cap.querySelector(".c")!;
    gsap.killTweensOf([t, c]);
    gsap.to([t, c], { yPercent: -110, opacity: 0, duration: .25, ease: "power2.in", onComplete: () => {
      if (!it) return; t.textContent = it.title; c.textContent = `${it.category}, ${it.meta}`;
      gsap.fromTo([t, c], { yPercent: 110, opacity: 1 }, { yPercent: 0, duration: .6, ease: "expo.out" });
    } });
  };
  function pick(): number {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(planes.filter((p) => p.visible && (p.material as THREE.MeshBasicMaterial).opacity > .3));
    return hits.length ? (hits[0]!.object.userData.i as number) : -1;
  }
  function onDown(e: PointerEvent) {
    if (!introDone || state.sel >= 0 && state.exp > .05 && false) return;
    dragging = true; moved = 0; path = 0; down = { x: e.clientX, y: e.clientY }; last = { x: e.clientX, y: e.clientY };
    if (state.sel < 0) { userTouched = true; stage.style.cursor = "grabbing"; }
  }
  function onMove(e: PointerEvent) {
    if (!running) return;
    ptr = { x: e.clientX, y: e.clientY }; const r = stage.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; hoverTick(); }); }
    qx(e.clientX + 14); qy(e.clientY + 14);
    if (dragging) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y; path += Math.hypot(dx, dy); moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); last = { x: e.clientX, y: e.clientY };
      if (state.sel < 0 && introDone) { vel.x += dx * .001; vel.y += dy * .001; }
    }
  }
  function onUp() {
    if (!dragging) return; dragging = false; stage.style.cursor = "";
    if (!introDone) return;
    if (moved < 6 && path < 10) click();
  }
  function onWheel(e: WheelEvent) { if (state.sel < 0 && introDone) { userTouched = true; vel.x += e.deltaY * .0002; } }
  function hoverTick() {
    if (!introDone || dragging && path > 6) return;
    const i = state.sel >= 0 ? (pick() === state.sel ? state.sel : -1) : pick();
    if (state.sel < 0 && i !== state.hover) { state.hover = i; setCaption(i >= 0 ? items[i]! : null); }
    const c = cfg(); void c;
    const over = state.sel >= 0 && i === state.sel;
    stage.style.cursor = dragging ? "grabbing" : i >= 0 ? "pointer" : Math.hypot(ptr.x - vw / 2, ptr.y - vh / 2) < 250 ? "grab" : "";
    const txt = state.ov > .5 ? "Close" : "Overview";
    if (over) { label.textContent = txt; gsap.to(label, { opacity: 1, scale: 1, duration: .6, ease: "power4.out" }); } else gsap.to(label, { opacity: 0, scale: .6, duration: .3 });
  }
  function click() {
    const i = pick();
    if (state.sel >= 0) {
      if (i === state.sel) { if (state.ov > .5) closeOverview(); else openOverview(); } else collapse();
      return;
    }
    if (i >= 0) expand(i);
  }
  function expand(i: number) {
    state.sel = i; setCaption(null); state.hover = -1;
    gsap.to(state, { exp: 1, duration: .8, ease: "power4.out" });
    label.style.transformOrigin = "0 0";
  }
  function openOverview() {
    const it = items[state.sel]!;
    $("#ovTitle").textContent = it.title; $("#ovMeta").textContent = `${it.category}, ${it.meta}`; $("#ovDesc").textContent = it.description;
    $("#ovTags").innerHTML = it.tags.map((t) => `<span>${t}</span>`).join("");
    const act = $("#ovActions"); act.innerHTML = "";
    if (it.face === "deal" && it.address) { const b = document.createElement("button"); b.className = "btn sm"; b.textContent = "Open the deal"; b.onclick = () => { void openDeal(it.address!); }; act.appendChild(b); }
    gsap.to(state, { ov: 1, duration: .8, ease: "power4.out" });
    gsap.set("#overview", { visibility: "visible" }); gsap.fromTo("#overview", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: "expo.out", delay: .12 });
  }
  function closeOverview() {
    gsap.to(state, { ov: 0, duration: .8, ease: "power4.out" });
    gsap.to("#overview", { opacity: 0, y: 16, duration: .4, onComplete: () => { gsap.set("#overview", { visibility: "hidden" }); } });
  }
  function collapse() {
    if (state.sel < 0) return;
    closeOverview(); gsap.to(label, { opacity: 0, duration: .25 });
    gsap.to(state, { exp: 0, duration: .8, ease: "power4.out", onComplete: () => { state.sel = -1; } });
  }

  /* ---------- frame ---------- */
  const axis = new THREE.Vector3(Math.sin(23 * Math.PI / 180), Math.cos(23 * Math.PI / 180), 0).normalize();
  const qa = new THREE.Quaternion(), tmp = new THREE.Vector3(), inv = new THREE.Quaternion();
  function frame() {
    raf = requestAnimationFrame(frame); if (!running) return;
    if (introDone) {
      if (state.exp < .001) {
        if (!userTouched) group.quaternion.premultiply(qa.setFromAxisAngle(axis, .001));
        vel.x *= .94; vel.y *= .94; target.x += vel.x; target.y += vel.y;
        const px_ = smooth.x, py_ = smooth.y; smooth.x += (target.x - smooth.x) * .11; smooth.y += (target.y - smooth.y) * .11;
        const dx = smooth.x - px_, dy = smooth.y - py_;
        if (dx) group.quaternion.premultiply(qa.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx));
        if (dy) group.quaternion.premultiply(qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy));
      }
      inv.copy(group.quaternion).invert();
      const c = cfg(), e = state.exp, o = state.ov;
      planes.forEach((m, i) => {
        m.quaternion.copy(inv); const mat = m.material as THREE.MeshBasicMaterial;
        if (e < .001 && state.sel < 0) return;
        if (i === state.sel) {
          const reserve = 290 * o, hPx = .7 * (vh - reserve); let h = hPx, w = h * 16 / 9;
          if (c.phone && w > vw - 16) { w = vw - 16; h = w * 9 / 16; }
          const yShift = reserve / 2;
          tmp.set(0, px(yShift), 0).applyQuaternion(inv);
          m.position.copy(base[i]!).lerp(tmp, e); m.scale.set(px(c.plane + (w - c.plane) * e), px((c.plane * 9 / 16) + (h - c.plane * 9 / 16) * e), 1);
          m.renderOrder = 10; mat.opacity = 1;
        } else {
          m.position.copy(base[i]!).multiplyScalar(1 + (1.8 - 1) * e); mat.opacity = 1 - (1 - .1) * e; m.renderOrder = 0;
        }
      });
    }
    renderer.render(scene, camera);
  }
  function onResize() { if (!built) return; layout(); if (introDone) planes.forEach((m, i) => { if (state.sel < 0) { m.position.copy(base[i]!); setScale(m, cfg().plane); } }); }

  return {
    show() {
      if (!built) { build(); }
      running = true; if (!raf) frame();
      if (!introDone) { if (reduced || !firstVisit) showFinished(); else intro(); firstVisit = false; }
    },
    hide() { running = false; if (state.sel >= 0) { state.sel = -1; state.exp = 0; state.ov = 0; closeOverview(); } gsap.set(label, { opacity: 0 }); cancelAnimationFrame(raf); raf = 0; },
    resize: onResize,
  };
}
