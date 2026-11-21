import gsap from "gsap";
export { gsap };
export const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];
export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const SANS = '"Geist", ui-sans-serif, system-ui, sans-serif';
export const SERIF = '"Newsreader", ui-serif, Georgia, serif';
export interface View { show(): void; hide(): void; resize(): void; refresh?(): void }
