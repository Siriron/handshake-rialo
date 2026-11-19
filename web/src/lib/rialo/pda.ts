import { PublicKey } from "@rialo/ts-cdk";
import { sha256 } from "@noble/hashes/sha2.js";
import { PROGRAM_ID, SUBSCRIBER_INTERFACE } from "./config";

const program = () => PublicKey.fromString(PROGRAM_ID);

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("slug must be 64 hex characters");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function randomSlug(): Uint8Array {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
}
const u64le = (n: number): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};

/** Deal account: seeds ["rialo_workflow", buyer, slug] under the Handshake program. */
export function dealAddress(buyer: PublicKey, slug: Uint8Array): PublicKey {
  if (slug.length !== 32) throw new Error("slug must be 32 bytes");
  return PublicKey.findProgramAddress(["rialo_workflow", buyer.toBytes(), slug], program())[0];
}

/** Venus multi_account_slug: sha256(deal ‖ branch u64 LE ‖ index u64 LE). */
export function multiAccountSlug(deal: PublicKey, branch: number, index: number): Uint8Array {
  const data = new Uint8Array(48);
  data.set(deal.toBytes(), 0);
  data.set(u64le(branch), 32);
  data.set(u64le(index), 40);
  return sha256(data);
}

/** Heartbeat timer account carried by `fund` (account index 4 in that instruction). */
export function heartbeatAddress(buyer: PublicKey, deal: PublicKey): PublicKey {
  const nonce = multiAccountSlug(deal, 0, 4);
  return PublicKey.findProgramAddress(
    ["rialo_subscribe", buyer.toBytes(), nonce],
    PublicKey.fromString(SUBSCRIBER_INTERFACE),
  )[0];
}
