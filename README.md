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
- Deployed and exercised on Rialo devnet. A live two-milestone deal paid one
  milestone and refunded the other with no manual step after funding. Signatures
  and logs are in [`docs/EVIDENCE.md`](docs/EVIDENCE.md), including an earlier
  run that did not settle and the list of paths not yet verified on chain.
- `core` has 19 tests; CI runs them and type-checks the program on every push.
- Not built yet: the frontend and the receipt page.

## Run the tests
    cargo test --manifest-path core/Cargo.toml
    cargo check --manifest-path program/Cargo.toml

## Deploying
The `deploy-devnet` and `test-devnet` workflows reproduce the deployment and the
live test deal from a Linux runner using the Rialo 0.18.1 toolchain. They need
three repository secrets holding devnet keypairs (deployer, program, REX); the
REX key's address is pinned as `AUTHORIZED_REX` in `program/src/lib.rs`. DevNet
timers expire after about 15 s, so every timer here is under 11 s.
