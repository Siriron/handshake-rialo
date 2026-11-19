import { PublicKey } from "@rialo/ts-cdk";
import { DEAL_ACCOUNT_SIZE, MAX_MILESTONES, PHASE, TARGET_WIDTH } from "./config";

export interface Milestone {
  index: number;
  amount: bigint;
  deadlineMs: bigint;
  kind: bigint;
  status: bigint;
  checks: bigint;
  target: string;
  startedMs: bigint;
  approved: boolean;
  ran: bigint;
}
export interface Deal {
  owner: string;
  payee: string;
  dealStatus: bigint; // 0 created, 1 funded
  count: number;
  remaining: bigint;
  milestones: Milestone[];
}

/** Decodes the 704-byte deal account. Validated against live devnet snapshots. */
export function decodeDeal(raw: Uint8Array): Deal {
  if (raw.length !== DEAL_ACCOUNT_SIZE) throw new Error(`unexpected deal account size ${raw.length}`);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let o = 0;
  const u64 = () => ((o += 8), dv.getBigUint64(o - 8, true));
  const pk = () => ((o += 32), PublicKey.fromBytes(raw.slice(o - 32, o)).toString());
  const arr = () => Array.from({ length: MAX_MILESTONES }, u64);

  const head = u64();
  if (head === 0n) throw new Error("deal account is not initialised");
  const owner = pk();
  const payee = pk();
  const dealStatus = u64();
  const countRaw = u64();
  const remaining = u64();
  const amounts = arr(), deadlines = arr(), kinds = arr(), status = arr(), checks = arr();
  const targets: string[] = [];
  for (let i = 0; i < MAX_MILESTONES; i++) {
    const n = Number(u64());
    if (n !== TARGET_WIDTH) throw new Error("unexpected target width");
    targets.push(new TextDecoder().decode(raw.slice(o, o + n)).replace(/\0+$/, ""));
    o += n;
  }
  pk(); // report account (internal)
  const started = arr(), approved = arr(), ran = arr();
  if (countRaw > BigInt(MAX_MILESTONES)) throw new Error("invalid milestone count");
  const count = Number(countRaw);
  const milestones: Milestone[] = [];
  for (let i = 0; i < count; i++)
    milestones.push({
      index: i,
      amount: amounts[i]!,
      deadlineMs: deadlines[i]!,
      kind: kinds[i]!,
      status: status[i]!,
      checks: checks[i]!,
      target: targets[i]!,
      startedMs: started[i]!,
      approved: approved[i] === 1n,
      ran: ran[i]!,
    });
  return { owner, payee, dealStatus, count, remaining, milestones };
}

export type Phase = "created" | "funded" | "checking" | "paid" | "refunded" | "unknown";
export function phaseName(s: bigint): Phase {
  for (const [k, v] of Object.entries(PHASE)) if (v === s) return k as Phase;
  return "unknown";
}
