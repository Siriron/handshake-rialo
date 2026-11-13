# Handshake

Milestone payments that complete themselves, built on Rialo.

A buyer locks funds against up to four milestones. Each milestone has an amount,
a deadline, and evidence the network can check. When a deadline passes, Rialo
validators fetch the evidence themselves (REX). If they unanimously agree the
milestone was met, the seller is paid. If they agree it was not, the buyer is
refunded. If they cannot agree, the check retries and then refunds. No keeper
bot, no oracle, no one pressing a button. The buyer can also approve early.

Money only moves between the two parties. There is no interest, yield, fee,
token, or speculation.

## Verifiers
| kind | target | met when |
| --- | --- | --- |
| 1 | `owner/repo@tag` | a published (non-draft) GitHub release with that tag exists |
| 2 | `owner/repo#123` | that pull request is merged |
| 0 | order id | your status endpoint reports `delivered` |

## Layout
- `core/` pure decision logic with 17 tests (validation, report classification,
  settlement accounting). The program calls it for every decision that moves money.
- `program/` the Venus program, its REX verifier, and the artifact crate.
- `docs/THREAT_MODEL.md` trust assumptions, attacks, and known gaps.
- `mock-endpoint/` demo status endpoint for kind 0 (Vercel function).

## Status
- VERIFIED here: `cargo test` passes for `core` (17 tests); `cargo check` passes
  for the program and its generated REX component (Venus 0.18.1, zero warnings).
- NOT VERIFIED: PolkaVM and WASM artifact builds, deployment, and any runtime
  behaviour on devnet. The `devnet-probe` workflow is the first step.
- Not built yet: the frontend and the receipt page.

## Run the tests
    cargo test --manifest-path core/Cargo.toml
    cargo check --manifest-path program/Cargo.toml   # needs Rust 1.85+

## Before deploying
Set the REX URL in `program/src/lib.rs` (kind 0 only) and `AUTHORIZED_REX` after
the first deploy. Deploy and invoke commands are in the sibling `rex-escrow`
README and will be confirmed against real runs.
