import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Keypair, KeypairSigner, PublicKey, airdrop, balanceKelvin, makeClient, type Client } from "./rialo/chain";

const KEY = "handshake.session-key.v1";
export const client: Client = makeClient("/api/rpc");

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Session {
  address: string;
  publicKey: PublicKey;
  signer: KeypairSigner;
  balance: bigint | null;
  refresh: () => Promise<void>;
  faucet: () => Promise<string | null>;
  reset: () => void;
}
const Ctx = createContext<Session | null>(null);
export const useSession = () => useContext(Ctx);

function load(): Keypair {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return Keypair.fromSecretKey(unb64(s));
  } catch { /* fall through to a fresh key */ }
  const kp = Keypair.generate();
  try { localStorage.setItem(KEY, b64(kp.secretKeyBytes())); } catch { /* private mode: key lives for this tab */ }
  return kp;
}

/** A devnet-only key generated in this browser. It never leaves the device. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [kp, setKp] = useState<Keypair | null>(null);
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const k = load();
    setKp(k);
    new KeypairSigner(k).getPublicKey().then((p) => alive.current && setAddress(p.toString()));
    return () => { alive.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    try { const b = await balanceKelvin(client, address); if (alive.current) setBalance(b); } catch { /* keep the last value */ }
  }, [address]);
  useEffect(() => { void refresh(); const t = setInterval(refresh, 15_000); return () => clearInterval(t); }, [refresh]);

  const value = useMemo<Session | null>(() => {
    if (!kp || !address) return null;
    return {
      address,
      publicKey: PublicKey.fromString(address),
      signer: new KeypairSigner(kp),
      balance,
      refresh,
      faucet: async () => {
        try { await airdrop(client, address, 1); await refresh(); return null; }
        catch (e) { return (e as Error).message || "The faucet did not respond."; }
      },
      reset: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } location.reload(); },
    };
  }, [kp, address, balance, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Deals this browser created: the slug is needed to approve a milestone early.
const DEALS = "handshake.deals.v1";
export interface SavedDeal { address: string; slug: string; seller: string; createdAt: number }
export const loadDeals = (): SavedDeal[] => { try { return JSON.parse(localStorage.getItem(DEALS) ?? "[]"); } catch { return []; } };
export function saveDeal(d: SavedDeal) {
  try { localStorage.setItem(DEALS, JSON.stringify([d, ...loadDeals().filter((x) => x.address !== d.address)].slice(0, 30))); } catch { /* ignore */ }
}
