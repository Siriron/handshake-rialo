# Handshake threat model

Status: written against the code in this repo. Nothing here has run on devnet
yet. "Tested" below means covered by `cargo test -p handshake-core`; "planned"
means a devnet test still to be written and run.

## What is protected
Kelvin the buyer locked for up to four milestones, held in the deal's workflow
PDA. Each milestone ends exactly once: paid to the seller or refunded to the buyer.

## Trust assumptions (read these first)
1. **Rialo validators and REX.** A report counts only if at least 3 validators
   returned byte-identical, successful payloads (tested). The program cannot
   know whether the network itself enforces further quorum rules.
2. **The evidence source.** The verifier proves what GitHub's public API (or
   your status endpoint) says, nothing more.
   - Kind 1 (release): proves a published, non-draft release with that tag
     exists. Whoever can publish releases in that repo controls the answer.
   - Kind 2 (pull request): proves a PR was merged. Whoever can merge into that
     repo controls the answer. **Point kind 2 at a repo the buyer controls**, so
     only the buyer's side can merge: then a merged PR is strong evidence.
   - Kind 0 (status endpoint): the endpoint's operator controls the answer. Use a
     neutral source, not either party's server.
3. **Inconclusive means refund.** If three checks in a row are not unanimous
   (API down, rate-limited, validators disagree) the buyer is refunded. This
   protects the buyer's funds and can cost an honest seller a payment. There is
   no dispute process in v1.

## Attacks considered
| Attack | Defence | Status |
| --- | --- | --- |
| Seller or buyer forges the REX report account | `on_check` requires the report account key to equal the PDA recorded when the request was armed, to be owned by the REX processor, and the report creator to be the buyer | code review; planned devnet negative test |
| One validator returns a different payload | every raw update must match; fewer than 3 updates is inconclusive | tested |
| Payload from another milestone or another kind replayed | payload must start with `HS1|<kind>|<exact target>|` and use that kind's vocabulary | tested |
| Oversized, non-UTF-8, or malformed payloads | rejected before parsing | tested |
| Milestone paid or refunded twice (late timer, forged handler call, repeated approve) | `settle` only acts on a FUNDED or CHECKING milestone and marks it; later calls do nothing | tested |
| Funds created or lost by accounting bugs | paid + refunded + remaining equals the funded total across 2,000 random sequences | tested |
| Out-of-range milestone index | rejected | tested |
| Overflow when summing amounts | checked arithmetic | tested |
| Hostile targets (path tricks, pipes, spaces, huge strings) | strict per-kind validators, length caps; the REX function re-validates | tested (core); REX copy by review |
| Overlapping verification windows | deadlines must be at least 30 s apart; one check at a time | tested |
| Buyer pulls funds early to starve the seller | no cancel path; only `approve` (pays the seller) | by design |
| Look-alike verifier substituted | program pins the REX bytecode account at create and at every check | code review; planned devnet test |
| Payee is a program account that cannot be credited | milestone is refunded instead of stuck | code review |
| Someone calls a handler directly | handlers check buyer and payee against stored owner and payee, then phase | code review; planned devnet test |

## Known gaps
- No disputes, arbiters, partial payouts, tokens, or fees.
- Timers expire after about 15 s on DevNet, so a heartbeat re-arms every 10 s.
  Long deals cost many small transactions; windows are capped at 24 hours.
- GitHub's unauthenticated API allows roughly 60 requests per hour per IP.
  If validators share egress IPs, checks may come back inconclusive.
- REX and rent costs fall on the workflow payer (the buyer). Unverified.
- Handler wiring is untested at runtime. The Venus toolchain does not let this
  repo unit-test the program itself on a normal machine.
