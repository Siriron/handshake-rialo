import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PublicKey } from "@rialo/ts-cdk";
import { addMilestoneData, approveIx, createData, fundData, fundIx, createIx } from "../src/lib/rialo/instructions";
import { dealAddress, heartbeatAddress, hexToBytes } from "../src/lib/rialo/pda";
import { decodeDeal, phaseName } from "../src/lib/rialo/decode";
import { TAG } from "../src/lib/rialo/config";

// Recorded from devnet probe run 44246793737.
const BUYER = PublicKey.fromString("G839F16yx2AyBcQvcX2NoVRmq3U8R5xAAfbn1ngdhDP6");
const SELLER = PublicKey.fromString("BuUruu5dUTrUYbxWo9kbQLuTptEoGDvRpgcTPQRKBBQH");
const SLUG = hexToBytes("9af7a3b512c8cdb59f0207a7a08b271b485ae72ddff05e8ff821a3c02cedfe3b");
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("addresses", () => {
  it("derives the live deal account", () => {
    expect(dealAddress(BUYER, SLUG).toString()).toBe("7XfpdxLcQAhACH14epmavkcoeXCHjsprAiJouACEgXiv");
  });
  it("derives the live heartbeat account", () => {
    const deal = dealAddress(BUYER, SLUG);
    expect(heartbeatAddress(BUYER, deal).toString()).toBe("G89A7ahZintKKuHVzA2GKturjuX5no4AuL1D6D7zGPJW");
  });
});

describe("instruction bytes match the recorded transactions", () => {
  it("create", () => {
    expect(hex(createData(SLUG, SELLER))).toBe(
      "010000009af7a3b512c8cdb59f0207a7a08b271b485ae72ddff05e8ff821a3c02cedfe3ba20692c7dfcc445c18263eab6f8ef305aeca95dbf539dd11d9287ef167a3131e65707094665bc5fa9cb2f41ea101ed9560838cbbe9a887be02bb1e9f03edf36e",
    );
  });
  it("add_milestone (pull request)", () => {
    expect(hex(addMilestoneData(SLUG, 23456789n, 1794981117691n, 2n, "cli/cli#1"))).toBe(
      "030000009af7a3b512c8cdb59f0207a7a08b271b485ae72ddff05e8ff821a3c02cedfe3b15ec650100000000fb3e36eda101000002000000000000000900000000000000636c692f636c692331",
    );
  });
  it("add_milestone (release)", () => {
    expect(hex(addMilestoneData(SLUG, 34567891n, 1794981187691n, 1n, "Siriron/handshake-rialo@v0.1.0"))).toBe(
      "030000009af7a3b512c8cdb59f0207a7a08b271b485ae72ddff05e8ff821a3c02cedfe3bd3760f02000000006b5037eda101000001000000000000001e0000000000000053697269726f6e2f68616e647368616b652d7269616c6f4076302e312e30",
    );
  });
  it("fund", () => {
    expect(hex(fundData(SLUG))).toBe("040000009af7a3b512c8cdb59f0207a7a08b271b485ae72ddff05e8ff821a3c02cedfe3b");
  });
});

describe("account lists", () => {
  const manifest = JSON.parse(readFileSync("test/fixtures/handshake-manifest.json", "utf8"));
  it("tags and account counts agree with the generated manifest", () => {
    expect(manifest.instructions.create.discriminant).toBe(TAG.create);
    expect(manifest.instructions.add_milestone.discriminant).toBe(TAG.addMilestone);
    expect(manifest.instructions.fund.discriminant).toBe(TAG.fund);
    expect(manifest.instructions.approve.discriminant).toBe(TAG.approve);
    expect(createIx(BUYER, SLUG, SELLER).accounts).toHaveLength(manifest.instructions.create.accounts.length);
    expect(fundIx(BUYER, SLUG).accounts).toHaveLength(manifest.instructions.fund.accounts.length);
    expect(approveIx(BUYER, SLUG, 0n).accounts).toHaveLength(manifest.instructions.approve.accounts.length);
  });
  it("only the buyer signs", () => {
    expect(fundIx(BUYER, SLUG).accounts.filter((a) => a.isSigner)).toHaveLength(1);
  });
});

describe("deal decoder (live snapshots)", () => {
  it("funded deal", () => {
    const d = decodeDeal(new Uint8Array(readFileSync("test/fixtures/deal-funded.bin")));
    expect(d.owner).toBe(BUYER.toString());
    expect(d.payee).toBe(SELLER.toString());
    expect(d.remaining).toBe(58024680n);
    expect(d.milestones.map((m) => m.target)).toEqual(["cli/cli#1", "Siriron/handshake-rialo@v0.1.0"]);
    expect(d.milestones.map((m) => phaseName(m.status))).toEqual(["funded", "funded"]);
  });
  it("settled deal", () => {
    const d = decodeDeal(new Uint8Array(readFileSync("test/fixtures/deal-settled.bin")));
    expect(d.remaining).toBe(0n);
    expect(d.milestones.map((m) => phaseName(m.status))).toEqual(["paid", "paid"]);
    expect(d.milestones[0]!.amount).toBe(23456789n);
  });
  it("rejects wrong sizes", () => {
    expect(() => decodeDeal(new Uint8Array(10))).toThrow();
  });
});
