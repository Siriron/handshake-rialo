# Evidence: what has actually run on Rialo devnet

Everything below is on Rialo devnet and can be checked independently.

| | |
| --- | --- |
| Program | `5umz6vh9vQ85fJhYrUmDMm6pGYVj5Cr5Tv9RS9GfEf2h` |
| REX verifier | `7pycwurxgfQMaTN9KMbHqn8vCcBzgZhJKvB4epLyjpH3` |
| Toolchain | Rialo 0.18.1, Venus 0.18.1 |
| Deployed by | the `deploy-devnet` workflow, from persistent keys held as repository secrets |

Check any signature with `rialo -n devnet client transaction <signature>`, or
the RPC at `https://devnet.rialo.io` (`getTransaction`, params
`[{"signature": "..."}]`).

## Live test deal (run 43564589979, 2026-11-14 UTC)
Two milestones of 0.05 RLO each, both verified against GitHub through REX.

| step | signature |
| --- | --- |
| create | `FofBXdpaVzyLJTkKm9ut1hf8s4VfhofqaPrigKrQjWedb54ZvPoKzvpEDphF6pj73gv8NEKTtxAHMPi5ebuEEZe` |
| add milestone 1 | `5sRgWN8dSQrMHKkLAHXknbW93Gfgt1QnYHotHZLKKvT3miHVp3P6wCqTv1LwBKbW35PPqvfb2VjavWDJMgJvbTe5` |
| add milestone 2 | `5M3YVZjAc3XvkgUBoQkbutMxq2B6wwUCeY4XjVGVxhaQkMs7dTezYLKB3sPmaofTiPsBs9ECN8bdKo1Pup3See34` |
| fund | `2U795Q6Rx9bbukj5YjoFpjxFLFFdDH29cVjdnMFsT2zwYvEeQPC2iFJxDKFfPWzoUo4ua8TAuofu2rszEKrT2bF` |
| milestone 1 paid | `HmBXwCKHJdynnty2U6w2wLHWjY8MvxLAvfFpeJM3QnRQnQj7D4MVLVeYz5DSBtU1r2y5kWxJA9p8uAMPfGhXk4w` |
| milestone 2 refunded | `5BqaPZAjH3CWeDWnzLE5pbTr5Ge4dqTz2sEiTjaQejfqR7ZB52iTcY7N8RRDY7uBzfvcRt1TMDJcfCYF86hmpPh` |

Program log of the payout transaction:

    handshake update 1: HS1|1|Siriron/handshake-rialo@v0.1.0|released
    handshake on_check milestone 0: 4 updates, verdict 1
    handshake milestone 0 settled: 50000000 kelvin

Program log of the refund transaction:

    handshake update 1: HS1|1|Siriron/handshake-rialo@v9.9.9|absent
    handshake on_check milestone 1: 4 updates, verdict 2
    handshake: validators agree milestone 1 was not met
    handshake milestone 1 settled: 50000000 kelvin

Balances: seller 0 to 0.05 RLO. Buyer 3.02964792 to 2.94955288 RLO, which is the
0.05 RLO paid out plus about 0.03 RLO of REX fees and rent for the two checks.
Nobody pressed a button after funding: the heartbeat, the deadline checks, the
REX requests and both settlements ran from timers and validator reports.

## An earlier run that did not settle (kept for honesty)
An earlier test deal with the same two milestones got four validator updates for
every check but every verdict was inconclusive, so the retry policy refunded
both milestones and the seller was never paid. The cause was not observed at
the time. GitHub's unauthenticated API rate limit is the leading suspect and is
unconfirmed. Since then the verifier reports HTTP failures as visible payloads
(`HS1|<kind>|<target>|http-<status>`) so any future occurrence is diagnosable.
Treat intermittent inconclusive checks as a real operating risk: they refund the
buyer rather than pay the seller.

## Not yet verified on devnet
- Pull-request verifier (kind 2) and status-endpoint verifier (kind 0).
- Early `approve`.
- The stuck-check rescue (`expire_check`): covered by unit tests of the decision
  logic only.
- The negative cases in the threat model (forged report account, repeated
  settlement, direct handler calls): covered by unit tests of the decision logic
  only; no adversarial transactions have been sent yet.
- Deals longer than a few minutes, and more than one deal at a time.
