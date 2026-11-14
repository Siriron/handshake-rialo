//! handshake-core: the decisions Handshake makes, kept free of chain types so
//! they can be tested exhaustively on a normal machine. The Venus program
//! calls these functions for every decision that moves money.

pub const MAX_MILESTONES: usize = 4;
/// A milestone deadline must be at least this far in the future (ms).
pub const MIN_WINDOW_MS: u64 = 60_000;
/// ...and at most this far (ms). Bounds heartbeat count and cost.
pub const MAX_WINDOW_MS: u64 = 86_400_000;
/// Consecutive milestone deadlines must be at least this far apart (ms), so
/// verification windows never overlap.
pub const MIN_GAP_MS: u64 = 30_000;
pub const MAX_CHECKS: u64 = 3;
/// A check with no usable report after this long is treated as inconclusive.
pub const CHECK_TIMEOUT_MS: u64 = 45_000;
pub const MIN_REPORTS: usize = 3;
pub const MAX_PAYLOAD: usize = 128;
pub const TARGET_WIDTH: usize = 64;

/// Per-milestone phases.
pub mod phase {
    pub const CREATED: u64 = 0;
    pub const FUNDED: u64 = 1;
    pub const CHECKING: u64 = 2;
    pub const PAID: u64 = 3;
    pub const REFUNDED: u64 = 4;
}

/// What a milestone is verified against.
pub mod kind {
    /// A status endpoint returning {"status": "..."} for an order id.
    pub const ORDER_STATUS: u64 = 0;
    /// A published GitHub release: target `owner/repo@tag`.
    pub const GITHUB_RELEASE: u64 = 1;
    /// A merged GitHub pull request: target `owner/repo#number`.
    pub const GITHUB_PR: u64 = 2;
}

pub const VERDICT_INCONCLUSIVE: u64 = 0;
pub const VERDICT_MET: u64 = 1;
pub const VERDICT_NOT_MET: u64 = 2;

fn slug_ok(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.len() <= max
        && !s.starts_with('.')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !s.contains("..")
}

pub fn valid_order_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= TARGET_WIDTH
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// `owner/repo@tag`
pub fn valid_github_release(target: &str) -> bool {
    if target.len() > TARGET_WIDTH {
        return false;
    }
    let Some((repo_part, tag)) = target.split_once('@') else { return false };
    let Some((owner, repo)) = repo_part.split_once('/') else { return false };
    slug_ok(owner, 39) && slug_ok(repo, 100) && slug_ok(tag, 40) && !repo.contains('/')
}

/// `owner/repo#number`
pub fn valid_github_pr(target: &str) -> bool {
    if target.len() > TARGET_WIDTH {
        return false;
    }
    let Some((repo_part, number)) = target.split_once('#') else { return false };
    let Some((owner, repo)) = repo_part.split_once('/') else { return false };
    let number_ok = !number.is_empty()
        && number.len() <= 9
        && !number.starts_with('0')
        && number.chars().all(|c| c.is_ascii_digit());
    slug_ok(owner, 39) && slug_ok(repo, 100) && !repo.contains('/') && number_ok
}

pub fn valid_target(kind_id: u64, target: &str) -> bool {
    match kind_id {
        kind::ORDER_STATUS => valid_order_id(target),
        kind::GITHUB_RELEASE => valid_github_release(target),
        kind::GITHUB_PR => valid_github_pr(target),
        _ => false,
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ScheduleError {
    TooMany,
    ZeroAmount,
    TargetInvalid,
    DeadlineInPast,
    TooSoon,
    TooFar,
    NotAfterPrevious,
    Overflow,
}

/// Validates one milestone being added. `count` is how many already exist and
/// `prev_deadline` the last one's deadline (ignored when `count == 0`).
pub fn check_milestone(
    now_ms: u64,
    count: usize,
    prev_deadline: u64,
    amount: u64,
    deadline_ms: u64,
    kind_id: u64,
    target: &str,
) -> Result<(), ScheduleError> {
    if count >= MAX_MILESTONES {
        return Err(ScheduleError::TooMany);
    }
    if amount == 0 {
        return Err(ScheduleError::ZeroAmount);
    }
    if !valid_target(kind_id, target) {
        return Err(ScheduleError::TargetInvalid);
    }
    let window = deadline_ms.checked_sub(now_ms).ok_or(ScheduleError::DeadlineInPast)?;
    if window < MIN_WINDOW_MS {
        return Err(ScheduleError::TooSoon);
    }
    if window > MAX_WINDOW_MS {
        return Err(ScheduleError::TooFar);
    }
    if count > 0 && deadline_ms < prev_deadline.saturating_add(MIN_GAP_MS) {
        return Err(ScheduleError::NotAfterPrevious);
    }
    Ok(())
}

/// Sum of the first `count` amounts, or None on overflow.
pub fn total(amounts: &[u64; MAX_MILESTONES], count: usize) -> Option<u64> {
    amounts.iter().take(count).try_fold(0u64, |acc, a| acc.checked_add(*a))
}

/// The states a verifier may report, per kind: (met, not_met).
fn states(kind_id: u64) -> Option<(&'static [&'static str], &'static [&'static str])> {
    match kind_id {
        kind::ORDER_STATUS => Some((&["delivered"], &["pending", "shipped", "cancelled"])),
        kind::GITHUB_RELEASE => Some((&["released"], &["absent"])),
        kind::GITHUB_PR => Some((&["merged"], &["open", "closed"])),
        _ => None,
    }
}

/// The exact string every honest validator must produce.
pub fn payload_prefix(kind_id: u64, target: &str) -> String {
    format!("HS1|{}|{}|", kind_id, target)
}

/// Classifies a REX report. `outputs` holds one entry per raw validator
/// update: `Some(bytes)` for a successful output, `None` for anything else.
/// A report counts only if there are enough updates and every one is a
/// successful, byte-identical, well-formed payload for this exact milestone.
pub fn classify(outputs: &[Option<Vec<u8>>], kind_id: u64, target: &str) -> u64 {
    if outputs.len() < MIN_REPORTS {
        return VERDICT_INCONCLUSIVE;
    }
    let Some(Some(first)) = outputs.first() else { return VERDICT_INCONCLUSIVE };
    if first.len() > MAX_PAYLOAD {
        return VERDICT_INCONCLUSIVE;
    }
    if outputs.iter().any(|o| o.as_ref() != Some(first)) {
        return VERDICT_INCONCLUSIVE;
    }
    let Ok(text) = std::str::from_utf8(first) else { return VERDICT_INCONCLUSIVE };
    let prefix = payload_prefix(kind_id, target);
    let Some(state) = text.strip_prefix(prefix.as_str()) else { return VERDICT_INCONCLUSIVE };
    let Some((met, not_met)) = states(kind_id) else { return VERDICT_INCONCLUSIVE };
    if met.contains(&state) {
        VERDICT_MET
    } else if not_met.contains(&state) {
        VERDICT_NOT_MET
    } else {
        VERDICT_INCONCLUSIVE
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Pay,
    Refund,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SettleError {
    BadIndex,
    NotOpen,
    ExceedsRemaining,
}

/// Settles one milestone exactly once. On success the milestone is marked and
/// `remaining` reduced; the caller moves the returned kelvin. Returns an error
/// without changing anything if the milestone is not open.
pub fn settle(
    status: &mut [u64; MAX_MILESTONES],
    amounts: &[u64; MAX_MILESTONES],
    remaining: &mut u64,
    index: usize,
    outcome: Outcome,
) -> Result<u64, SettleError> {
    if index >= MAX_MILESTONES {
        return Err(SettleError::BadIndex);
    }
    if status[index] != phase::FUNDED && status[index] != phase::CHECKING {
        return Err(SettleError::NotOpen);
    }
    let amount = amounts[index];
    if amount > *remaining {
        return Err(SettleError::ExceedsRemaining);
    }
    *remaining -= amount;
    status[index] = match outcome {
        Outcome::Pay => phase::PAID,
        Outcome::Refund => phase::REFUNDED,
    };
    Ok(amount)
}

/// After an inconclusive check: retry, or give up and refund.
pub fn should_retry(checks: u64) -> bool {
    checks < MAX_CHECKS
}

/// Index of the first funded milestone whose deadline has passed, provided no
/// milestone is already being checked.
pub fn next_due(
    status: &[u64; MAX_MILESTONES],
    deadlines: &[u64; MAX_MILESTONES],
    count: usize,
    now_ms: u64,
) -> Option<usize> {
    if status.iter().take(count).any(|s| *s == phase::CHECKING) {
        return None;
    }
    (0..count.min(MAX_MILESTONES)).find(|i| status[*i] == phase::FUNDED && now_ms >= deadlines[*i])
}

/// A milestone whose check started more than `CHECK_TIMEOUT_MS` ago and is
/// still waiting. Lets the heartbeat rescue a check whose report never arrived.
pub fn stuck_check(
    status: &[u64; MAX_MILESTONES],
    started: &[u64; MAX_MILESTONES],
    count: usize,
    now_ms: u64,
) -> Option<usize> {
    (0..count.min(MAX_MILESTONES)).find(|i| {
        status[*i] == phase::CHECKING && now_ms.saturating_sub(started[*i]) > CHECK_TIMEOUT_MS
    })
}

/// True while any milestone is still open, so the heartbeat must keep going.
pub fn any_open(status: &[u64; MAX_MILESTONES], count: usize) -> bool {
    status.iter().take(count).any(|s| *s == phase::FUNDED || *s == phase::CHECKING)
}

#[cfg(test)]
mod tests;
