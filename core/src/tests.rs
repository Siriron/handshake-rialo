use super::*;

fn out(s: &str) -> Option<Vec<u8>> {
    Some(s.as_bytes().to_vec())
}
fn four(s: &str) -> Vec<Option<Vec<u8>>> {
    vec![out(s), out(s), out(s), out(s)]
}

// ---- target validation -----------------------------------------------------

#[test]
fn order_ids() {
    assert!(valid_order_id("delivered-001"));
    assert!(valid_order_id("A_b-9"));
    assert!(!valid_order_id(""));
    assert!(!valid_order_id("has space"));
    assert!(!valid_order_id("a|b"));
    assert!(!valid_order_id("a/b"));
    assert!(!valid_order_id(&"x".repeat(TARGET_WIDTH + 1)));
}

#[test]
fn github_release_targets() {
    assert!(valid_github_release("rialo/example@v1.0.0"));
    assert!(valid_github_release("a-b/c.d@release_2"));
    assert!(!valid_github_release("owner/repo"));
    assert!(!valid_github_release("owner@v1"));
    assert!(!valid_github_release("owner/repo@"));
    assert!(!valid_github_release("owner/repo/extra@v1"));
    assert!(!valid_github_release("../repo@v1"));
    assert!(!valid_github_release("owner/repo@v1..2"));
    assert!(!valid_github_release("owner/re po@v1"));
    assert!(!valid_github_release("owner/repo@v1|x"));
    assert!(!valid_github_release(".hidden/repo@v1"));
    assert!(!valid_github_release(&format!("o/{}@v1", "r".repeat(70))));
}

#[test]
fn github_pr_targets() {
    assert!(valid_github_pr("rialo/example#42"));
    assert!(!valid_github_pr("rialo/example#0"));
    assert!(!valid_github_pr("rialo/example#042"));
    assert!(!valid_github_pr("rialo/example#4x"));
    assert!(!valid_github_pr("rialo/example#"));
    assert!(!valid_github_pr("rialo/example"));
    assert!(!valid_github_pr("rialo/example#1234567890"));
    assert!(!valid_github_pr("rialo/example@v1"));
}

#[test]
fn kind_routes_to_the_right_validator() {
    assert!(valid_target(kind::ORDER_STATUS, "ord-1"));
    assert!(!valid_target(kind::ORDER_STATUS, "o/r@v1"));
    assert!(valid_target(kind::GITHUB_RELEASE, "o/r@v1"));
    assert!(!valid_target(kind::GITHUB_RELEASE, "o/r#1"));
    assert!(valid_target(kind::GITHUB_PR, "o/r#1"));
    assert!(!valid_target(7, "ord-1"));
}

// ---- schedule --------------------------------------------------------------

const NOW: u64 = 1_000_000_000_000;

#[test]
fn schedule_rules() {
    let ok = |count, prev, amount, dl, k, t| check_milestone(NOW, count, prev, amount, dl, k, t);
    assert_eq!(ok(0, 0, 5, NOW + 120_000, 0, "ord-1"), Ok(()));
    assert_eq!(ok(4, 0, 5, NOW + 120_000, 0, "ord-1"), Err(ScheduleError::TooMany));
    assert_eq!(ok(0, 0, 0, NOW + 120_000, 0, "ord-1"), Err(ScheduleError::ZeroAmount));
    assert_eq!(ok(0, 0, 5, NOW + 120_000, 0, "bad id"), Err(ScheduleError::TargetInvalid));
    assert_eq!(ok(0, 0, 5, NOW - 1, 0, "ord-1"), Err(ScheduleError::DeadlineInPast));
    assert_eq!(ok(0, 0, 5, NOW + MIN_WINDOW_MS - 1, 0, "ord-1"), Err(ScheduleError::TooSoon));
    assert_eq!(ok(0, 0, 5, NOW + MAX_WINDOW_MS + 1, 0, "ord-1"), Err(ScheduleError::TooFar));
    assert_eq!(ok(0, 0, 5, NOW + MAX_WINDOW_MS, 0, "ord-1"), Ok(()));
    let prev = NOW + 100_000;
    assert_eq!(
        ok(1, prev, 5, prev + MIN_GAP_MS - 1, 0, "ord-1"),
        Err(ScheduleError::NotAfterPrevious)
    );
    assert_eq!(ok(1, prev, 5, prev + MIN_GAP_MS, 0, "ord-1"), Ok(()));
}

#[test]
fn total_detects_overflow() {
    assert_eq!(total(&[1, 2, 3, 4], 4), Some(10));
    assert_eq!(total(&[1, 2, 3, 4], 2), Some(3));
    assert_eq!(total(&[u64::MAX, 1, 0, 0], 2), None);
    // amounts beyond `count` are ignored even if they would overflow
    assert_eq!(total(&[1, 1, u64::MAX, u64::MAX], 2), Some(2));
}

// ---- classification --------------------------------------------------------

#[test]
fn unanimous_met_and_not_met() {
    let t = "ord-1";
    assert_eq!(classify(&four("HS1|0|ord-1|delivered"), 0, t), VERDICT_MET);
    for s in ["pending", "shipped", "cancelled"] {
        assert_eq!(classify(&four(&format!("HS1|0|ord-1|{}", s)), 0, t), VERDICT_NOT_MET);
    }
    assert_eq!(classify(&four("HS1|1|o/r@v1|released"), 1, "o/r@v1"), VERDICT_MET);
    assert_eq!(classify(&four("HS1|1|o/r@v1|absent"), 1, "o/r@v1"), VERDICT_NOT_MET);
    assert_eq!(classify(&four("HS1|2|o/r#9|merged"), 2, "o/r#9"), VERDICT_MET);
    assert_eq!(classify(&four("HS1|2|o/r#9|open"), 2, "o/r#9"), VERDICT_NOT_MET);
    assert_eq!(classify(&four("HS1|2|o/r#9|closed"), 2, "o/r#9"), VERDICT_NOT_MET);
}

#[test]
fn minimum_report_count() {
    let s = "HS1|0|ord-1|delivered";
    assert_eq!(classify(&[], 0, "ord-1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&[out(s), out(s)], 0, "ord-1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&[out(s), out(s), out(s)], 0, "ord-1"), VERDICT_MET);
}

#[test]
fn one_dissenter_or_failure_blocks_the_report() {
    let good = "HS1|0|ord-1|delivered";
    let mut r = four(good);
    r[3] = out("HS1|0|ord-1|pending");
    assert_eq!(classify(&r, 0, "ord-1"), VERDICT_INCONCLUSIVE);
    let mut r = four(good);
    r[2] = None;
    assert_eq!(classify(&r, 0, "ord-1"), VERDICT_INCONCLUSIVE);
    let mut r = four(good);
    r[0] = None; // first entry failed
    assert_eq!(classify(&r, 0, "ord-1"), VERDICT_INCONCLUSIVE);
    let r = vec![None, None, None, None];
    assert_eq!(classify(&r, 0, "ord-1"), VERDICT_INCONCLUSIVE);
}

#[test]
fn payload_must_bind_to_this_exact_milestone() {
    // another order's "delivered" must never satisfy this order
    assert_eq!(classify(&four("HS1|0|ord-2|delivered"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    // a different kind must not satisfy this kind
    assert_eq!(classify(&four("HS1|1|ord-1|delivered"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    // a state from another kind's vocabulary is rejected
    assert_eq!(classify(&four("HS1|1|o/r@v1|delivered"), 1, "o/r@v1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&four("HS1|0|ord-1|merged"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    // wrong version tag, missing prefix, trailing data, case, whitespace
    assert_eq!(classify(&four("HS2|0|ord-1|delivered"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&four("0|ord-1|delivered"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&four("HS1|0|ord-1|delivered "), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&four("HS1|0|ord-1|Delivered"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    assert_eq!(classify(&four("HS1|0|ord-1|delivered|x"), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    // unknown kind
    assert_eq!(classify(&four("HS1|9|ord-1|delivered"), 9, "ord-1"), VERDICT_INCONCLUSIVE);
}

#[test]
fn oversize_and_non_utf8_payloads_are_rejected() {
    let big = format!("HS1|0|ord-1|{}", "d".repeat(MAX_PAYLOAD));
    assert_eq!(classify(&four(&big), 0, "ord-1"), VERDICT_INCONCLUSIVE);
    let bad = vec![Some(vec![0xff, 0xfe, 0xfd]); 4];
    assert_eq!(classify(&bad, 0, "ord-1"), VERDICT_INCONCLUSIVE);
}

// ---- settlement accounting -------------------------------------------------

#[test]
fn settle_pays_and_refunds_once() {
    let amounts = [10, 20, 30, 40];
    let mut status = [phase::FUNDED; 4];
    let mut remaining = 100;
    assert_eq!(settle(&mut status, &amounts, &mut remaining, 0, Outcome::Pay), Ok(10));
    assert_eq!(status[0], phase::PAID);
    assert_eq!(remaining, 90);
    // a late or forged second call is rejected and changes nothing
    assert_eq!(
        settle(&mut status, &amounts, &mut remaining, 0, Outcome::Refund),
        Err(SettleError::NotOpen)
    );
    assert_eq!(status[0], phase::PAID);
    assert_eq!(remaining, 90);
    assert_eq!(settle(&mut status, &amounts, &mut remaining, 1, Outcome::Refund), Ok(20));
    assert_eq!(status[1], phase::REFUNDED);
}

#[test]
fn settle_rejects_bad_state_and_index() {
    let amounts = [10, 20, 30, 40];
    let mut remaining = 100;
    let mut status = [phase::CREATED; 4];
    assert_eq!(
        settle(&mut status, &amounts, &mut remaining, 0, Outcome::Pay),
        Err(SettleError::NotOpen)
    );
    assert_eq!(
        settle(&mut status, &amounts, &mut remaining, 4, Outcome::Pay),
        Err(SettleError::BadIndex)
    );
    let mut status = [phase::FUNDED; 4];
    let mut remaining = 5; // less than amounts[0]
    assert_eq!(
        settle(&mut status, &amounts, &mut remaining, 0, Outcome::Pay),
        Err(SettleError::ExceedsRemaining)
    );
    assert_eq!(status[0], phase::FUNDED);
    assert_eq!(remaining, 5);
}

/// Deterministic pseudo-random sequences of settle attempts. Whatever happens,
/// paid + refunded + remaining must always equal the funded total, and every
/// milestone must be settled at most once.
#[test]
fn conservation_under_random_sequences() {
    let mut seed: u64 = 0x9e3779b97f4a7c15;
    let mut next = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };
    for _ in 0..2_000 {
        let count = 1 + (next() % 4) as usize;
        let mut amounts = [0u64; 4];
        for a in amounts.iter_mut().take(count) {
            *a = 1 + next() % 1_000_000;
        }
        let funded = total(&amounts, count).unwrap();
        let mut status = [phase::CREATED; 4];
        for s in status.iter_mut().take(count) {
            *s = phase::FUNDED;
        }
        let mut remaining = funded;
        let (mut paid, mut refunded) = (0u64, 0u64);
        let mut settled = [false; 4];
        for _ in 0..24 {
            let index = (next() % 6) as usize; // includes out-of-range indexes
            let outcome = if next() % 2 == 0 { Outcome::Pay } else { Outcome::Refund };
            let is_pay = outcome == Outcome::Pay;
            if next() % 5 == 0 && index < 4 && status[index] == phase::FUNDED {
                status[index] = phase::CHECKING; // mid-check is still settleable
            }
            if let Ok(amount) = settle(&mut status, &amounts, &mut remaining, index, outcome) {
                assert!(!settled[index], "milestone settled twice");
                settled[index] = true;
                if is_pay { paid += amount } else { refunded += amount }
            }
            assert_eq!(paid + refunded + remaining, funded);
        }
    }
}

// ---- scheduling decisions --------------------------------------------------

#[test]
fn next_due_picks_the_first_due_milestone_and_never_overlaps() {
    let deadlines = [100, 200, 300, 400];
    let mut status = [phase::FUNDED; 4];
    assert_eq!(next_due(&status, &deadlines, 4, 99), None);
    assert_eq!(next_due(&status, &deadlines, 4, 100), Some(0));
    assert_eq!(next_due(&status, &deadlines, 4, 450), Some(0)); // oldest first
    status[0] = phase::CHECKING;
    assert_eq!(next_due(&status, &deadlines, 4, 450), None); // one at a time
    status[0] = phase::PAID;
    assert_eq!(next_due(&status, &deadlines, 4, 450), Some(1));
    // milestones beyond `count` are ignored
    assert_eq!(next_due(&status, &deadlines, 1, 450), None);
}

#[test]
fn heartbeat_stops_only_when_nothing_is_open() {
    assert!(any_open(&[phase::PAID, phase::FUNDED, 0, 0], 2));
    assert!(any_open(&[phase::CHECKING, 0, 0, 0], 1));
    assert!(!any_open(&[phase::PAID, phase::REFUNDED, 0, 0], 2));
    assert!(!any_open(&[phase::FUNDED, 0, 0, 0], 0));
}

#[test]
fn retry_policy() {
    assert!(should_retry(0));
    assert!(should_retry(MAX_CHECKS - 1));
    assert!(!should_retry(MAX_CHECKS));
}

#[test]
fn stuck_check_detection() {
    let started = [1_000, 0, 0, 0];
    let mut status = [phase::CHECKING, phase::FUNDED, phase::FUNDED, phase::FUNDED];
    // not stuck until strictly past the timeout
    assert_eq!(stuck_check(&status, &started, 4, 1_000 + CHECK_TIMEOUT_MS), None);
    assert_eq!(stuck_check(&status, &started, 4, 1_000 + CHECK_TIMEOUT_MS + 1), Some(0));
    // only CHECKING milestones can be stuck
    status[0] = phase::PAID;
    assert_eq!(stuck_check(&status, &started, 4, u64::MAX), None);
    // milestones beyond `count` are ignored
    let status = [phase::FUNDED, phase::CHECKING, phase::FUNDED, phase::FUNDED];
    let started = [0, 5, 0, 0];
    assert_eq!(stuck_check(&status, &started, 1, u64::MAX), None);
    assert_eq!(stuck_check(&status, &started, 2, 5 + CHECK_TIMEOUT_MS + 1), Some(1));
    // a clock that runs backwards never marks a check stuck
    assert_eq!(stuck_check(&status, &started, 2, 0), None);
}

#[test]
fn a_stuck_check_always_ends_in_a_refund() {
    // simulate: checks time out repeatedly; after MAX_CHECKS attempts the
    // milestone must be refundable and the heartbeat must be able to stop
    let amounts = [10, 0, 0, 0];
    let mut status = [phase::CHECKING, 0, 0, 0];
    let mut remaining = 10;
    let mut checks = 1u64;
    while should_retry(checks) {
        checks += 1; // retried after a timeout
    }
    assert_eq!(checks, MAX_CHECKS);
    assert_eq!(settle(&mut status, &amounts, &mut remaining, 0, Outcome::Refund), Ok(10));
    assert!(!any_open(&status, 1));
}
