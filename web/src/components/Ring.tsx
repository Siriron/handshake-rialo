import { useEffect, useRef } from "react";
import * as THREE from "three";

export type NodeState = "empty" | "draft" | "funded" | "checking" | "paid" | "refunded";

const TOKEN: Record<NodeState, string | null> = {
  empty: null, draft: "--ink", funded: "--s-funded", checking: "--s-funded", paid: "--s-paid", refunded: "--s-refunded",
};
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/** Four milestone slots on a ring. Slots reflect real deal state; drag to turn it. */
export function Ring({ nodes, themeKey }: { nodes: NodeState[]; themeKey: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ apply: (n: NodeState[]) => void } | null>(null);
  const latest = useRef(nodes);
  latest.current = nodes;

  useEffect(() => {
    const el = host.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.z = 11;
    const group = new THREE.Group();
    scene.add(group);

    const R = 2.9, W = 2.4, H = (W * 9) / 16;
    const slots = [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, H)), new THREE.LineBasicMaterial({ transparent: true }));
      const s = new THREE.Group();
      s.add(fill, edge);
      s.position.set(Math.cos(a) * R, Math.sin(a) * R * 0.62, Math.sin(a) * 0.9);
      group.add(s);
      return { s, fill, edge };
    });
    const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62, 1)), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }));
    group.add(core);

    let states = latest.current;
    const paint = () => {
      const ink = css("--ink");
      slots.forEach((sl, i) => {
        const st = states[i] ?? "empty";
        const tok = TOKEN[st];
        const c = new THREE.Color(tok ? css(tok) : css("--mute"));
        (sl.edge.material as THREE.LineBasicMaterial).color = c;
        (sl.edge.material as THREE.LineBasicMaterial).opacity = st === "empty" ? 0.45 : 1;
        (sl.fill.material as THREE.MeshBasicMaterial).color = c;
        (sl.fill.material as THREE.MeshBasicMaterial).opacity = st === "empty" ? 0 : st === "draft" ? 0.1 : st === "checking" ? 0.28 : 0.42;
      });
      (core.material as THREE.LineBasicMaterial).color = new THREE.Color(ink);
    };
    paint();
    api.current = { apply: (n) => { states = n; paint(); } };

    let w = 0, h = 0;
    const resize = () => {
      w = el.clientWidth; h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the whole ring in view on narrow screens.
      camera.position.z = Math.max(11, 11 * (1.25 / camera.aspect) * 0.62 + 3);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let vel = 0, yaw = 0, dragging = false, lastX = 0, idle = !reduce;
    const down = (e: PointerEvent) => { dragging = true; idle = false; lastX = e.clientX; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!dragging) return; vel += (e.clientX - lastX) * 0.0016; lastX = e.clientX; };
    const up = () => { dragging = false; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    let raf = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
    io.observe(el);
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = clock.getElapsedTime();
      vel *= 0.94;
      yaw += vel + (idle ? 0.0016 : 0);
      group.rotation.y = yaw;
      group.rotation.x = -0.18;
      core.rotation.y = t * 0.3; core.rotation.x = t * 0.2;
      slots.forEach((sl, i) => {
        sl.s.quaternion.copy(group.quaternion).invert(); // keep each slot facing the camera
        if (states[i] === "checking" && !reduce) (sl.fill.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.4));
      });
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | undefined; mat?.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { api.current?.apply(nodes); }, [nodes, themeKey]);
  return <div ref={host} className="ring" role="img" aria-label={`Deal milestones: ${nodes.length ? nodes.join(", ") : "none yet"}`} />;
}
