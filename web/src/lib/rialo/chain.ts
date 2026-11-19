import {
  Keypair,
  KeypairSigner,
  PublicKey,
  TransactionBuilder,
  createRialoClient,
  type Instruction,
  type Signer,
} from "@rialo/ts-cdk";
import { DEAL_ACCOUNT_SIZE, KELVIN_PER_RLO, PROGRAM_ID } from "./config";
import { decodeDeal, type Deal } from "./decode";

export type Client = ReturnType<typeof createRialoClient>;

export function makeClient(rpcUrl: string): Client {
  return createRialoClient({ chain: { id: "rialo:devnet", name: "Rialo Devnet", rpcUrl } });
}

/** One instruction per transaction: Venus control calls must land one at a time. */
export async function sendIx(client: Client, signer: Signer, ix: Instruction): Promise<string> {
  const payer = await signer.getPublicKey();
  const tx = TransactionBuilder.create()
    .setPayer(payer)
    .setValidFrom(BigInt(Date.now()))
    .setConfigHashPrefix(await client.getConfigHashPrefix())
    .addInstruction(ix)
    .build();
  const signed = await tx.signWith(signer);
  const res = await client.sendAndConfirmTransaction(signed.serialize(), {});
  if (!res.executed || res.err) throw new Error(res.err ?? "transaction was not executed");
  return res.signature;
}

export interface DealRead {
  address: string;
  deal: Deal;
  kelvin: bigint;
}
/** Reads and decodes a deal. Treats the account as untrusted: owner and size are checked. */
export async function readDeal(client: Client, address: string): Promise<DealRead | null> {
  let info;
  try {
    info = await client.getAccountInfo(PublicKey.fromString(address));
  } catch {
    return null;
  }
  if (!info) return null;
  const owner = info.owner.toString();
  if (owner !== PROGRAM_ID) throw new Error("that account is not a Handshake deal");
  const b64 = info.data[0] ?? "";
  const bin = atob(b64);
  const data = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (data.length !== DEAL_ACCOUNT_SIZE) throw new Error("deal account has an unexpected size");
  return { address, deal: decodeDeal(data), kelvin: BigInt(info.kelvin as bigint | number) };
}

export async function balanceKelvin(client: Client, address: string): Promise<bigint> {
  return BigInt(await client.getBalance(PublicKey.fromString(address)));
}
export async function airdrop(client: Client, address: string, rlo = 1): Promise<void> {
  await client.requestAirdrop(PublicKey.fromString(address), BigInt(rlo) * KELVIN_PER_RLO);
}

export { Keypair, KeypairSigner, PublicKey };
