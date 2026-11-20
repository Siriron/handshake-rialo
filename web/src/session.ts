import { Keypair, KeypairSigner, PublicKey, airdrop, balanceKelvin, makeClient, type Client } from "./lib/rialo/chain";

const KEY = "handshake.session-key.v1";
const DEALS = "handshake.deals.v1";
export const client: Client = makeClient("/api/rpc");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Wallet { address: string; publicKey: PublicKey; signer: KeypairSigner }
export let wallet: Wallet | null = null;
export let balance: bigint | null = null;
const subs = new Set<() => void>();
export const onWallet = (f: () => void) => (subs.add(f), () => subs.delete(f));
const emit = () => subs.forEach((f) => f());

function loadKey(): Keypair {
  try { const s = localStorage.getItem(KEY); if (s) return Keypair.fromSecretKey(unb64(s)); } catch { /* fresh key */ }
  const kp = Keypair.generate();
  try { localStorage.setItem(KEY, b64(kp.secretKeyBytes())); } catch { /* private mode */ }
  return kp;
}
export async function initWallet() {
  const kp = loadKey();
  const signer = new KeypairSigner(kp);
  const publicKey = await signer.getPublicKey();
  wallet = { address: publicKey.toString(), publicKey, signer };
  emit();
  void refreshBalance();
  setInterval(refreshBalance, 15000);
}
export async function refreshBalance() {
  if (!wallet) return;
  try { balance = await balanceKelvin(client, wallet.address); emit(); } catch { /* keep last */ }
}
export async function faucet(): Promise<string | null> {
  if (!wallet) return "Wallet is still starting.";
  try { await airdrop(client, wallet.address, 1); await refreshBalance(); return null; }
  catch (e) { return (e as Error).message || "The faucet did not respond."; }
}
export function resetWallet() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } location.reload(); }

export interface SavedDeal { address: string; slug: string; seller: string; createdAt: number }
export const loadDeals = (): SavedDeal[] => { try { return JSON.parse(localStorage.getItem(DEALS) ?? "[]"); } catch { return []; } };
export function saveDeal(d: SavedDeal) {
  try { localStorage.setItem(DEALS, JSON.stringify([d, ...loadDeals().filter((x) => x.address !== d.address)].slice(0, 30))); } catch { /* ignore */ }
}
