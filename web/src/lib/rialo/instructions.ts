import { PublicKey, type AccountMeta, type Instruction } from "@rialo/ts-cdk";
import { PROGRAM_ID, REX_ID, SUBSCRIBER_INTERFACE, SYSTEM_PROGRAM, TAG } from "./config";
import { dealAddress, heartbeatAddress } from "./pda";

class Writer {
  private parts: Uint8Array[] = [];
  u32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    this.parts.push(b);
    return this;
  }
  u64(n: bigint) {
    if (n < 0n || n > 0xffffffffffffffffn) throw new Error("u64 out of range");
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, n, true);
    this.parts.push(b);
    return this;
  }
  bytes(b: Uint8Array) {
    this.parts.push(b);
    return this;
  }
  string(s: string) {
    const e = new TextEncoder().encode(s);
    return this.u64(BigInt(e.length)).bytes(e);
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of this.parts) (out.set(p, o), (o += p.length));
    return out;
  }
}

const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta => ({
  pubkey,
  isSigner,
  isWritable,
});

function base(buyer: PublicKey, slug: Uint8Array): AccountMeta[] {
  return [
    meta(buyer, true, true),
    meta(dealAddress(buyer, slug), false, true),
    meta(PublicKey.fromString(SYSTEM_PROGRAM), false, false),
    meta(PublicKey.fromString(SUBSCRIBER_INTERFACE), false, false),
  ];
}
const ix = (accounts: AccountMeta[], data: Uint8Array): Instruction => ({
  programId: PublicKey.fromString(PROGRAM_ID),
  accounts,
  data,
});

export function createData(slug: Uint8Array, payee: PublicKey): Uint8Array {
  return new Writer()
    .u32(TAG.create)
    .bytes(slug)
    .bytes(payee.toBytes())
    .bytes(PublicKey.fromString(REX_ID).toBytes())
    .done();
}
export const createIx = (buyer: PublicKey, slug: Uint8Array, payee: PublicKey) =>
  ix(base(buyer, slug), createData(slug, payee));

export function addMilestoneData(
  slug: Uint8Array,
  amountKelvin: bigint,
  deadlineMs: bigint,
  kind: bigint,
  target: string,
): Uint8Array {
  return new Writer()
    .u32(TAG.addMilestone)
    .bytes(slug)
    .u64(amountKelvin)
    .u64(deadlineMs)
    .u64(kind)
    .string(target)
    .done();
}
export const addMilestoneIx = (
  buyer: PublicKey,
  slug: Uint8Array,
  amountKelvin: bigint,
  deadlineMs: bigint,
  kind: bigint,
  target: string,
) => ix(base(buyer, slug), addMilestoneData(slug, amountKelvin, deadlineMs, kind, target));

export const fundData = (slug: Uint8Array) => new Writer().u32(TAG.fund).bytes(slug).done();
export function fundIx(buyer: PublicKey, slug: Uint8Array): Instruction {
  const accounts = base(buyer, slug);
  accounts.push(meta(heartbeatAddress(buyer, dealAddress(buyer, slug)), false, true));
  return ix(accounts, fundData(slug));
}

export const approveData = (slug: Uint8Array, index: bigint) =>
  new Writer().u32(TAG.approve).bytes(slug).u64(index).done();
export const approveIx = (buyer: PublicKey, slug: Uint8Array, index: bigint) =>
  ix(base(buyer, slug), approveData(slug, index));
