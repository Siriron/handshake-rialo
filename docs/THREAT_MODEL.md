# Handshake threat model

Status: matches the code in this repo. "Tested" means covered by
`cargo test` in `core/` (23 tests). "Devnet" means observed on Rialo
devnet; see [`EVIDENCE.md`](EVIDENCE.md) for signatures. "Review" means checked
by reading the code only.

## What is protected
Kelvin the buyer locked for up to four milestones, held in the deal's workflow
PDA. Each milestone ends exactly once: paid to the seller or refunded to the buyer.

## Who can do what
A deal lives in a workflow account derived from the buyer's key and a slug, so
only the buyer can address it (devnet: a seller's call against the buyer's deal
failed with no effect). Everything after `fund` is driven by timers and
validator reports, not by either party. The adversary that matters is therefore
the **buyer**, who can sign any instruction against their own deal and wants to
avoid paying; a seller cannot touch the deal at all.

## Trust assumptions (read these first)
1. **Rialo validators and REX.** A report counts only if at least 3 validators
   returned byte-identical, successful payloads (tested). The program cannot know
   whether the network enforces further quorum rules.
2. **The evidence source.** The verifier proves what GitHub's public API says,
   nothing more.
   - Release (`owner/repo@tag`): a published, non-draft release with that tag
     exists. Whoever can publish releases in that repo controls the answer.
   - Pull request (`owner/repo#number`): the PR is merged. Whoever can merge into
     that repo controls the answer. **Point this at a repo the buyer controls**, so
     only the buyer's side can merge: then a merged PR is strong evidence.
3. **Inconclusive means refund.** If three checks in a row are not unanimous (API
   down, rate-limited, validators disagree, toolchain mismatch) the buyer is
   refunded. This protects the buyer's funds and can cost an honest seller a
   payment. There is no dispute process in v1.
4. **The toolchain is part of the trust base.** The REX verifier is a WASI
   component; a Rust version whose WASI imports validators do not support makes
   every check inconclusive. The version is pinned (see the README).

## Attacks considered
| Attack | Defence | Status |
| --- | --- | --- |
| Buyer passes a forged `report` argument to `on_check` | the verdict is computed from the report parsed out of the REX report account, never from the argument; the account must be the PDA recorded when the request was armed, be owned by the REX processor, and the report must be created by the buyer | review; handlers cannot be called from the CLI, so not sent on chain |
| One validator returns a different payload | every raw update must match; fewer than 3 updates is inconclusive | tested |
| Payload from another milestone or kind replayed | payload must start with `HS1|<kind>|<exact target>|` and use that kind's vocabulary | tested |
| Oversized, non-UTF-8, malformed or HTTP-error payloads | rejected before parsing; HTTP failures are visible `http-<status>` payloads and count as inconclusive | tested |
| Milestone paid or refunded twice | `settle` only acts on an open milestone and marks it; later calls do nothing | tested; devnet (a deal settled once after attacks) |
| Funds created or lost by accounting bugs | paid + refunded + remaining equals the funded total across 2,000 random sequences | tested |
| Seller approves or pays themselves | the deal cannot be addressed by the seller; an early payout also requires the buyer's recorded approval | devnet (seller's `approve` failed); tested |
| Buyer re-creates a funded deal to reset its state | `create` fails on an existing workflow | devnet |
| Buyer forces an early refund via `expire_check` | the handler re-checks that all attempts are used and the last one timed out | tested; review |
| Buyer spams `run_check` to stall or exhaust checks | bounded by the attempt limit; after the last attempt a conclusive report still settles and an inconclusive one refunds | tested; review |
| Overlapping verification windows | deadlines at least 30 s apart; one check at a time | tested |
| Hostile targets (path tricks, pipes, spaces, huge strings) | strict per-kind validators, length caps; the REX function re-validates | tested (core); REX copy by review |
| Out-of-range index, overflowing amounts | rejected, checked arithmetic | tested |
| Buyer pulls funds early to starve the seller | no cancel path; only `approve`, which pays the seller | by design |
| Look-alike verifier substituted | the program pins the REX component address at create and at every check | devnet (every check ran against the pinned address) |
| Payee is a program account that cannot be credited | milestone is refunded instead of stuck | review |
| A second timer armed from a control call replaces the heartbeat | only `fund` arms a timer from a control call; `approve` records state and the heartbeat acts on it | found and fixed on devnet |
| A stalled check locks funds forever (a check that keeps failing, for example a buyer who drained the wallet that pays for REX) | check attempts are counted when the heartbeat arms them, so the budget is spent even if the check itself fails; after the last attempt a timeout triggers a refund | tested (simulation of a dead check pipeline); not sent on devnet |
| Direct caller runs extra REX attempts to orphan the real report | a separate count of consumed attempts; a run is only allowed when an armed attempt is outstanding | tested |
| An approved milestone is refunded by the expiry path | the heartbeat acts in strict priority (approved, then stuck, then due) and `expire_check` ignores approved milestones | review; devnet (approvals paid correctly) |
| Dust milestone that cannot be credited to a new account | minimum amount of 0.01 RLO | tested |
| Deal funded after its first deadline into an instant check | `fund` requires the first deadline to be ahead | tested; devnet (every funded deal) |
| Payee set to the escrow account, the program, or the zero address | refused at `create` | review |
| A different program-owned account passed where the escrow account is expected | deposits and payouts require the account to be the deal's own derived escrow account | review; devnet (every deposit and payout) |
| Index values that truncate when converted for the 32-bit target | every handler checks the 64-bit index against 4 before converting | review |
| Secrets exposed to third-party actions in CI | keys are scoped to the single step that needs them; actions are pinned to commits; credentials are not persisted by checkout; devnet workflows are manual and serialised | review |

## Known gaps
- No disputes, arbiters, partial payouts, tokens, or fees.
- Timers expire after about 15 s on DevNet, so a heartbeat re-arms every 10 s.
  Windows are capped at 24 hours; longer deals are untested.
- GitHub's unauthenticated API allows roughly 60 requests per hour per IP. If
  validators share egress IPs, checks can come back inconclusive.
- REX fees and rent fall on the workflow payer (the buyer): about 0.03 RLO for a
  two-milestone deal on devnet.
- Direct handler calls with raw transactions, the stuck-check rescue, a check
  pipeline that fails every time, and long deals have not been exercised on
  devnet.
- Liveness rests on the heartbeat: if a timer transaction ever failed outright, a
  deal would stall with its funds locked. None has been observed.
- The buyer chooses the payee and the targets, and a seller has no on-chain way to
  accept terms. A seller must read the deal before doing work.
- The Rialo installer is fetched without a published checksum in the devnet
  workflows (devnet keys only, manual runs only).
