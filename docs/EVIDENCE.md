# Evidence: what has actually run on Rialo devnet

Everything below is on Rialo devnet and can be checked independently.

| | |
| --- | --- |
| Program | `5umz6vh9vQ85fJhYrUmDMm6pGYVj5Cr5Tv9RS9GfEf2h` |
| REX verifier | `7pycwurxgfQMaTN9KMbHqn8vCcBzgZhJKvB4epLyjpH3` |
| Toolchain | Rialo 0.18.1, Venus 0.18.1, Rust 1.90.0 (pinned in `rust-toolchain.toml`) |
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
every check, but every verdict was inconclusive, so the retry policy refunded
both milestones and the seller was never paid. The cause was a toolchain
mismatch, not the contract logic: the REX verifier compiles to a WASI component,
and built with Rust 1.100 it imports `wasi:cli/exit@0.2.12`, which the DevNet
validators could not instantiate (the validator error is quoted in
`rust-toolchain.toml`). Building with Rust 1.90.0 imports WASI 0.2.3 and the
live deal above then settled correctly. The probe output that compared Rust
versions is on the `wasi-results` branch.

Two lessons recorded here: bumping the Rust pin can silently break every check,
so it needs a live devnet test; and a check that fails this way refunds the
buyer rather than paying the seller. The verifier also now reports HTTP failures
as visible payloads (`HS1|<kind>|<target>|http-<status>`), so other failures are
diagnosable from the transaction logs.

## Live scenarios (run 43692934375, 2026-11-15 UTC)
Three deals ran at the same time from one buyer, every setup transaction
confirmed before the next, against the program as deployed by run 43692607972.
Source: `.github/workflows/test-scenarios.yml`. Seller balances start at 0 except
C (1 RLO, so it can sign).

| scenario | what was sent | result |
| --- | --- | --- |
| A. pull-request verifier | milestone 1 = merged PR `cli/cli#1`, milestone 2 = closed-unmerged PR `cli/cli#7` | seller +0.05 RLO: milestone 1 paid (`24kM4bAryWciJZc3TWSFUxbHVgZes3hB3CEUqUGWMFvbT9WrzEprvsaJoht3qK6xrJLJEWtaZpDxVE4Qr5tDyfHh`), milestone 2 refunded (`24fFdboAAmsV7stJxoSfbbX6HwB2BUD5qsMi2mHKnqFPRjqJ5YEgJ1QaK9pHmrTMiBQVjUqzJM8Cu4ysMrLZed19`) |
| B. early approval | buyer calls `approve` on a milestone due in 15 minutes | seller +0.03 RLO within about 10 s, paid by the heartbeat (`4H81i4YwthZsx4U1Dhd2XcVKcoRqFSyWE8NfxoNSWbUQU5caDvVucMAHkV4uHpaNHuErfQpkHWzPFNKBq6vupnfR`) |
| C1. seller approves the buyer's deal | seller signs `approve` against the buyer's deal | failed on chain, `InvalidAccountData` (`WCcfpd42ym48BqXQ73f6bUNnLar6DKTbTSLCN6XrMWyX5Ammy5j97rvTHsQoksqhiJ87xfw9pkCTJeQEngEBcoj`); the call addresses a different workflow derived from the seller's own key, which does not exist |
| C3. buyer re-creates a funded deal | buyer calls `create` again with the same slug | failed on chain, `InvalidAccountData` (`65Gq9VK4J27wQXAQ7MeVUa9fFupPDFEfa27xcTtZU7LuCSkSmWivNcR72Z8W6SHCHuaUEmzuKi4pAdp1Ts6vKQ1C`); an earlier run's log of the same call reads "Already in a workflow" |
| C. settlement after the attacks | the deal from C1 and C3, milestone due in about 110 s | still settled exactly once, +0.04 RLO (`2nEZh9wEYCmfKMBJq6WJe7nXmKm63uh98pDWkTV8XfihH4WdtJch222gQ8MDtaiojtCtiQkSsckgyxUkGNKncWf9`) |

Failed transactions cost 0 kelvin. Program logs for A:

    handshake update 1: HS1|2|cli/cli#1|merged
    handshake on_check milestone 0: 4 updates, verdict 1
    handshake milestone 0 settled: 50000000 kelvin
    handshake update 1: HS1|2|cli/cli#7|closed
    handshake on_check milestone 1: 4 updates, verdict 2
    handshake: validators agree milestone 1 was not met

## Regression on the audited build (run 44028572250, commit e8a86ef)
After the code audit below, the program was redeployed in place and all scenarios
were run again, now including a release-verifier deal (D) and four deals at once
from one buyer. Every setup transaction was confirmed before the next; none failed.

    RESULT A pull-request verifier: PASS (seller +0.05; merged PR paid, unmerged PR refunded)
    RESULT D release verifier: PASS (seller +0.05; published release paid, missing tag refunded)
    RESULT B early approval: PASS (seller +0.03)
    RESULT C1 seller cannot approve the buyer's deal: PASS (failed on chain)
    RESULT C3 buyer cannot re-create a funded deal: PASS (failed on chain)
    RESULT C deal still settled once after attacks: PASS (seller 1 -> 1.04)

Failed attack transactions: C1 `3eh9JU29ab8f8pkheaJnU4K1JokyoKCng2MWu6bjPv6nQoSLskaqaFzdbYrcBsjyDRvHrBgC2UDyqErR1eRFURBB`,
C3 `5e2ov7Bs22GQjFGQiUaT9ahsZHHBtKzeuUeaz5nEQ1r4gZNZeer7Ssgzpc9pUeYW2Z3eBcHwrByQq72KY6haYKym`.
The signatures for the payouts in the table above come from the earlier run of
the same scenarios; the later run is recorded by its pass lines and run id (the
raw log of the latest run is on the `scenario-results` branch until it is
overwritten by the next run).

## Defects found by testing, and fixed
1. **`approve` silently killed the heartbeat.** The first version armed a timer
   from the control call. All control calls run in "branch 0", so that timer used
   the same subscription address as the heartbeat armed by `fund` (visible as the
   same `subscription=` address in both transactions) and replaced it: nothing
   ran afterwards. `approve` now only records the approval in state and the
   heartbeat, which runs in its own timer branches, pays it. A milestone can only
   be paid early if it was approved.
2. **The test harness raced the chain.** `rialo client program invoke` submits a
   transaction without waiting for it, so back-to-back calls could execute out
   of order (a `fund` landed before its `add_milestone` and failed). Each call is
   now confirmed on chain before the next. The failed run is why scenarios B and
   C failed once before this passing run; neither failure was a settlement bug
   once the cause was found.
3. **Report authenticity.** `on_check` used to classify the `report` argument.
   It now parses the report from the REX report account itself (and rejects any
   other account or a report not created by the buyer), so a forged argument
   cannot change a verdict. `run_check` is bounded by the attempt limit and
   `expire_check` re-verifies its own timeout. These are deployed and unit
   tested; the forged-argument case itself has not been sent on chain.

4. **A failing check could retry forever.** Attempts used to be counted inside
   `run_check`, so a check that kept failing (for example a buyer who drained the
   wallet that pays for REX) reverted its own counter and never ran out of
   attempts, locking the funds. Attempts are now counted when the heartbeat arms
   them, with a separate count of attempts actually started. Found by code review
   and covered by a simulation of a dead check pipeline; not sent on devnet.
5. **An approved milestone could be refunded.** If a milestone was both approved
   and stuck, the payout and the expiry could be armed on the same tick and the
   expiry could win. The heartbeat now acts in strict priority (approved, stuck,
   due), and `expire_check` ignores approved milestones.
6. **Dust and stale funding.** A tiny milestone paid to a brand-new account would
   fail at the runtime and end in a refund; amounts below 0.01 RLO are refused. A
   deal could be funded after its first deadline into an instant check; `fund`
   now requires the first deadline to be ahead.
7. **Escrow-account identity was assumed.** Deposits and payouts trusted the
   account at a fixed position to be the deal's escrow account; they now verify
   its address. Payees equal to the escrow account, the program or the zero
   address are refused.
8. **Looser target rules in the verifier than in the core.** The REX function
   allowed targets (`..`, a leading dot) that the core rejects. The rules now
   match, and 64-bit indexes are checked before narrowing to the 32-bit target's
   `usize`.
9. **Workflow hygiene.** Secrets were exposed to every step, a failed deploy
   reported success, and CI ran the code under test with a write-capable token.
   Keys are scoped to one step, deploys verify the stored keys and the reported
   addresses and fail loudly, devnet jobs run one at a time, third-party actions
   are pinned to commits, and CI gained format and clippy gates.

## Not yet verified on devnet
- Calling a handler directly with a hand-built transaction. The CLI manifest only
  exposes `create`, `add_milestone`, `fund` and `approve`, so handlers cannot be
  invoked from the CLI; I have no evidence either way about raw transactions.
- A forged `report` argument to `on_check`, and `expire_check` called early:
  covered by unit tests of the decision logic and by code review only.
- The stuck-check rescue (a check whose report never arrives) and a check
  pipeline that fails every time: unit tests and a simulation only; neither has
  triggered on chain.
- Deals longer than a few minutes.

## Web client

The web app's chain code (deal address, instruction bytes, account decoder, transaction sending) was run against devnet by scripts that use throwaway keys and no repository secrets. Output of the latest run is on the `web-e2e-results` and `web-presets-results` branches until the next run overwrites it.

| run | what it did | result |
| --- | --- | --- |
| `web-e2e`, run 44429673810 | create, two milestones, fund, early approve, wait for a deadline | the approved milestone paid, the closed-unmerged PR milestone refunded, the deal ended with nothing held, the seller received exactly the approved amount |
| `web-presets`, run 44844859228 | all five demo presets through the form's own plan | every preset ended as described: release paid, unmerged PR refunded, two milestones both paid, mixed paid then refunded, early approval paid |

Eleven unit tests check the address derivation, the instruction bytes and the account decoder against transactions and accounts recorded from devnet (probe run 44246793737).

**Not verified:** the deployed page's buttons were not driven by an automated browser against live devnet. The scripts above cover the same code path but not the page itself.

