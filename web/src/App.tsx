import { useEffect, useState } from "react";
import { SessionProvider } from "./lib/session";
import { NewDeal } from "./views/NewDeal";
import { Track } from "./views/Track";
import { Proof } from "./views/Proof";

type Theme = "auto" | "dark" | "light";
const THEME_KEY = "handshake.theme";

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || "new");
  useEffect(() => {
    const on = () => setH(location.hash.slice(1) || "new");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
}

function useTheme(): [Theme, (t: Theme) => void, string] {
  const [t, setT] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || "auto");
  const [dark, setDark] = useState(matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const resolved = t === "auto" ? (dark ? "dark" : "light") : t;
  useEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);
  return [t, (n) => { setT(n); try { localStorage.setItem(THEME_KEY, n); } catch { /* ignore */ } }, resolved];
}

const TABS = [
  { id: "new", label: "New deal", n: 1 },
  { id: "track", label: "Track", n: 2 },
  { id: "proof", label: "Proof", n: 3 },
] as const;

export function App() {
  const hash = useHash();
  const [theme, setTheme, resolved] = useTheme();
  const [menu, setMenu] = useState(false);
  const route = hash.split("/")[0]!;
  const arg = hash.split("/")[1];
  const active = TABS.find((t) => t.id === route)?.id ?? "new";
  useEffect(() => { setMenu(false); document.title = `${TABS.find((t) => t.id === active)!.label} — Handshake`; }, [hash, active]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);

  return (
    <SessionProvider>
      <main className="view" key={active}>
        {active === "new" && <NewDeal themeKey={resolved} />}
        {active === "track" && <Track address={arg} themeKey={resolved} />}
        {active === "proof" && <Proof />}
      </main>
      <nav className="dock" aria-label="Main">
        <a className="mark" href="#new">Handshake</a>
        <span className="sep" />
        {TABS.map((t) => (
          <a key={t.id} className="tab" href={`#${t.id}`} aria-current={active === t.id ? "page" : undefined}>
            <i>{t.label}</i><span>{t.n}</span>
            {active !== t.id && <span className="sr">{t.label}</span>}
          </a>
        ))}
        <span className="sep" />
        <button className="menu-btn" aria-label="Settings" aria-expanded={menu} aria-controls="menu" onClick={() => setMenu((m) => !m)} />
      </nav>
      <div id="menu" className="menu" data-open={menu} role="group" aria-label="Settings">
        <span className="label">Appearance</span>
        <div className="seg">
          {(["auto", "dark", "light"] as Theme[]).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <span className="note">Rialo devnet. Test funds only.</span>
      </div>
    </SessionProvider>
  );
}
