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
- VERIFIED on a clean GitHub runner (see the `ci` workflow): `cargo test` passes for
  `core` (17 tests); `cargo check` passes for the program and its generated REX
  component (Venus 0.18.1).
- NOT VERIFIED: PolkaVM and WASM artifact builds, deployment, and any runtime
  behaviour on devnet. The `devnet-probe` workflow is the first step.
- Not built yet: the frontend and the receipt page.

## Toolchain pin (important)
`rust-toolchain.toml` pins Rust 1.90.0. The REX verifier compiles to a WASI
component whose imports depend on the Rust version, and a component built with
current stable (1.100, WASI 0.2.12) fails to instantiate on DevNet validators.
Do not bump the pin without a live devnet check.

## Run the tests
    cargo test --manifest-path core/Cargo.toml
    cargo check --manifest-path program/Cargo.toml

## Deploying (planned; commands follow Merit's published DevNet evidence)
Not yet run for this program, so treat every line as unconfirmed.

    rialoman install stable@0.18.1          # also: rustup target add wasm32-wasip2
    cargo build --manifest-path program/artifact/Cargo.toml
    rialo client program deploy-venus program   # prints program id + REX bytecode account

Then set `AUTHORIZED_REX` in `program/src/lib.rs` to the printed REX account
(until then `create` fails closed), rebuild, and redeploy. Every call names the
deal by a random 32-byte hex `workflow_pda_slug` and passes
`--rex-bytecode-account`. Kind 0 also needs your endpoint URL set in the REX
function. DevNet timers expire after about 15 s, so every timer here is under 11 s.
