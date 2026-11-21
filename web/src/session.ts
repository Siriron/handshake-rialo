import { Keypair, KeypairSigner, PublicKey, airdrop, balanceKelvin, makeClient, type Client } from "./lib/rialo/chain";

const STORE = "handshake.accounts.v2";
const LEGACY = "handshake.session-key.v1";
const DEALS = "handshake.deals.v1";
export const client: Client = makeClient("/api/rpc");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Wallet { address: string; publicKey: PublicKey; signer: KeypairSigner }
export interface Account { address: string; index: number }

/** Wallet state lives in memory. Switching accounts updates it and notifies listeners; the page never reloads. */
export let wallet: Wallet | null = null;
export let balance: bigint | null = null;
export let accounts: Account[] = [];
let keys: Keypair[] = [];
let active = -1;
let lastActive = 0;
const subs = new Set<() => void>();
export const onWallet = (f: () => void) => (subs.add(f), () => { subs.delete(f); });
const emit = () => subs.forEach((f) => f());

const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ keys: keys.map((k) => b64(k.secretKeyBytes())), active: lastActive })); } catch { /* private mode: keys live for this tab */ } };

async function apply(i: number) {
  if (i < 0) { wallet = null; balance = null; active = -1; emit(); return; }
  const signer = new KeypairSigner(keys[i]!);
  const publicKey = await signer.getPublicKey();
  active = i; lastActive = i; wallet = { address: publicKey.toString(), publicKey, signer }; balance = null; save(); emit();
  void refreshBalance();
}
async function addrOf(k: Keypair) { return (await new KeypairSigner(k).getPublicKey()).toString(); }

export async function initWallet() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const d = JSON.parse(raw) as { keys: string[]; active: number }; keys = d.keys.map((s) => Keypair.fromSecretKey(unb64(s))); lastActive = d.active ?? 0; }
    else { const old = localStorage.getItem(LEGACY); if (old) keys = [Keypair.fromSecretKey(unb64(old))]; }
  } catch { keys = []; }
  if (!keys.length) keys = [Keypair.generate()];
  accounts = await Promise.all(keys.map(async (k, index) => ({ address: await addrOf(k), index })));
  await apply(Math.min(Math.max(lastActive, 0), keys.length - 1));
  setInterval(refreshBalance, 15000);
}
export const activeIndex = () => active;
export async function switchAccount(i: number) { if (i >= 0 && i < keys.length) await apply(i); }
export async function addAccount() { const k = Keypair.generate(); keys.push(k); accounts = [...accounts, { address: await addrOf(k), index: keys.length - 1 }]; await apply(keys.length - 1); }
export async function disconnect() { await apply(-1); }
export async function reconnect() { if (keys.length) await apply(Math.min(lastActive, keys.length - 1)); }
export async function refreshBalance() {
  if (!wallet) return; const at = wallet.address;
  try { const b = await balanceKelvin(client, at); if (wallet?.address === at) { balance = b; emit(); } } catch { /* keep last */ }
}
export async function faucet(): Promise<string | null> {
  if (!wallet) return "Connect an account first.";
  try { await airdrop(client, wallet.address, 1); await refreshBalance(); return null; }
  catch (e) { return (e as Error).message || "The faucet did not respond."; }
}

export interface SavedDeal { address: string; slug: string; seller: string; createdAt: number; buyer?: string }
export const loadDeals = (): SavedDeal[] => { try { return JSON.parse(localStorage.getItem(DEALS) ?? "[]"); } catch { return []; } };
/** Deals made with the connected account (deals saved before accounts existed have no buyer and show for all). */
export const myDeals = () => loadDeals().filter((d) => !d.buyer || d.buyer === wallet?.address);
export function saveDeal(d: SavedDeal) {
  try { localStorage.setItem(DEALS, JSON.stringify([d, ...loadDeals().filter((x) => x.address !== d.address)].slice(0, 30))); } catch { /* ignore */ }
}
