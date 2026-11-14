//! Handshake: milestone escrow on Rialo (Venus 0.18.1).
//!
//! A buyer locks funds against up to four milestones. Each milestone has an
//! amount, a deadline, and a verifier. When a deadline passes, validators fetch
//! the evidence themselves (REX); a unanimous "met" report pays the seller, a
//! unanimous "not met" report refunds the buyer, and an inconclusive report is
//! retried and then refunded. No keeper bot and no oracle. The buyer may also
//! approve a milestone early.
//!
//! Every decision that moves money lives in `handshake-core`, which has its own
//! tests. This file only wires those decisions to Rialo accounts and timers.
//! Patterns follow the Merit probe program: absolute-millisecond timers,
//! timer-armed REX requests, report-PDA binding, fixed-width state, and
//! handlers that do nothing unless the milestone is in the expected phase.

use rialo_venus_proc_macro::rialo;

/// Heartbeat interval (ms). A DevNet timestamp subscription expires after
/// ~100 commits (~14.7 s), so every timer must stay well under that.
pub const BEAT_MS: u64 = 10_000;
/// Wait between inconclusive checks (ms); same ceiling as above.
pub const RETRY_MS: u64 = 8_000;
/// The REX component program id. It is deterministic: the deploy workflow
/// passes the REX keypair (a repo secret) to `deploy-venus --rex-keypair`, so
/// this address is known before the first deploy. If the deployed REX account
/// ever differs from this value, `create` fails closed.
pub const AUTHORIZED_REX: &str = "7pycwurxgfQMaTN9KMbHqn8vCcBzgZhJKvB4epLyjpH3";

pub mod deal {
    pub const CREATED: u64 = 0;
    pub const FUNDED: u64 = 1;
}

rialo! {
    workflow {
        state {
            owner: Pubkey,
            payee: Pubkey,
            deal_status: u64,
            count: u64,
            remaining: u64,
            amounts: [u64; 4],
            deadlines: [u64; 4],
            kinds: [u64; 4],
            status: [u64; 4],
            checks: [u64; 4],
            targets: [String; 4],
            report_pda: Pubkey,
            started: [u64; 4],
        }

        rex {
            // Runs on validators. kind: "0" order-status endpoint, "1" GitHub
            // release, "2" GitHub pull request. Output is a tiny deterministic
            // string every honest validator must reproduce byte for byte.
            pub fn verify(kind: String, target: String) -> Result<String, String> {
                use rialo::rex_component::http;
                use serde_json::Value;

                let ok = |s: &str, max: usize| {
                    !s.is_empty()
                        && s.len() <= max
                        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
                };
                let headers = vec![
                    ("Accept".to_string(), "application/vnd.github+json".to_string()),
                    ("User-Agent".to_string(), "Handshake-Rialo/0.1".to_string()),
                ];
                let state: String;
                if kind == "1" {
                    // owner/repo@tag
                    let (repo_part, tag) = target.split_once('@').ok_or("bad target")?;
                    let (owner, repo) = repo_part.split_once('/').ok_or("bad target")?;
                    if !ok(owner, 39) || !ok(repo, 100) || !ok(tag, 40) {
                        return Err("bad target".to_string());
                    }
                    let url = format!("https://api.github.com/repos/{}/{}/releases/tags/{}", owner, repo, tag);
                    let response = http::get(&url, &headers, 10_000)
                        .map_err(|error| format!("request failed: {}", error))?;
                    if response.status == 404 {
                        state = "absent".to_string();
                    } else if response.status == 200 {
                        let body = serde_json::from_slice::<Value>(&response.body)
                            .map_err(|_| "invalid JSON".to_string())?;
                        let draft = body.get("draft").and_then(Value::as_bool).unwrap_or(true);
                        let name = body.get("tag_name").and_then(Value::as_str).unwrap_or("");
                        state = if !draft && name == tag { "released" } else { "absent" }.to_string();
                    } else {
                        state = format!("http-{}", response.status);
                    }
                } else if kind == "2" {
                    // owner/repo#number
                    let (repo_part, number) = target.split_once('#').ok_or("bad target")?;
                    let (owner, repo) = repo_part.split_once('/').ok_or("bad target")?;
                    if !ok(owner, 39) || !ok(repo, 100) || number.is_empty()
                        || number.len() > 9 || !number.chars().all(|c| c.is_ascii_digit())
                    {
                        return Err("bad target".to_string());
                    }
                    let url = format!("https://api.github.com/repos/{}/{}/pulls/{}", owner, repo, number);
                    let response = http::get(&url, &headers, 10_000)
                        .map_err(|error| format!("request failed: {}", error))?;
                    if response.status != 200 {
                        return Ok(format!("HS1|{}|{}|http-{}", kind, target, response.status));
                    }
                    let body = serde_json::from_slice::<Value>(&response.body)
                        .map_err(|_| "invalid JSON".to_string())?;
                    let merged = body.get("merged").and_then(Value::as_bool).unwrap_or(false);
                    let open = body.get("state").and_then(Value::as_str) == Some("open");
                    state = if merged { "merged" } else if open { "open" } else { "closed" }.to_string();
                } else if kind == "0" {
                    // order id against a status endpoint you control or trust
                    if !ok(&target, 64) {
                        return Err("bad target".to_string());
                    }
                    let url = format!("https://YOUR-ENDPOINT.example/api/orders/{}", target);
                    let response = http::get(&url, &headers, 10_000)
                        .map_err(|error| format!("request failed: {}", error))?;
                    if response.status != 200 {
                        return Ok(format!("HS1|{}|{}|http-{}", kind, target, response.status));
                    }
                    let body = serde_json::from_slice::<Value>(&response.body)
                        .map_err(|_| "invalid JSON".to_string())?;
                    let status = body.get("status").and_then(Value::as_str).ok_or("missing status")?;
                    if !["pending", "shipped", "delivered", "cancelled"].contains(&status) {
                        return Err("unknown status".to_string());
                    }
                    state = status.to_string();
                } else {
                    return Err("unknown kind".to_string());
                }
                Ok(format!("HS1|{}|{}|{}", kind, target, state))
            }
        }

        program {
            use rialo_rex_processor_interface::{
                instruction::derive_report_address, state::RexReport,
            };
            use rialo_s_program::{
                account_info::AccountInfo, entrypoint::ProgramResult, msg, program::invoke,
                program_error::ProgramError, pubkey::Pubkey, rent::Rent, system_instruction,
                system_program, sysvar::Sysvar,
            };
            use rialo_types::{RexData, RexOutput};

            // ---------------------------------------------------------------
            // Buyer instructions
            // ---------------------------------------------------------------

            initiating fn create(&mut self, payee: Pubkey) -> ProgramResult {
                if !self.payer_account().is_signer {
                    return Err(ProgramError::MissingRequiredSignature);
                }
                self.require_authorized_rex()?;
                if payee == *self.payer_account().key {
                    return Err(ProgramError::InvalidArgument);
                }
                self.owner = *self.payer_account().key;
                self.payee = payee;
                self.deal_status = crate::deal::CREATED;
                self.count = 0;
                self.remaining = 0;
                self.report_pda = Pubkey::default();
                self.started = [0u64; 4];
                for i in 0..4 {
                    self.amounts[i] = 0;
                    self.deadlines[i] = 0;
                    self.kinds[i] = 0;
                    self.status[i] = handshake_core::phase::CREATED;
                    self.checks[i] = 0;
                    self.targets[i] = Self::fixed("", handshake_core::TARGET_WIDTH);
                }
                msg!("handshake created for payee {}", self.payee);
                Ok(())
            }

            // Adds the next milestone (up to four) before the deal is funded.
            control fn add_milestone(
                &mut self,
                amount_kelvin: u64,
                deadline_ms: u64,
                kind: u64,
                target: String,
            ) -> ProgramResult {
                self.require_owner()?;
                if self.deal_status != crate::deal::CREATED {
                    return Err(ProgramError::InvalidArgument);
                }
                let index = self.count as usize;
                let prev = if index == 0 { 0 } else { self.deadlines[index - 1] };
                let target = target.trim().to_string();
                let now = self.now_ms()?;
                if handshake_core::check_milestone(
                    now, index, prev, amount_kelvin, deadline_ms, kind, &target,
                )
                .is_err()
                {
                    msg!("handshake rejected milestone");
                    return Err(ProgramError::InvalidArgument);
                }
                self.amounts[index] = amount_kelvin;
                self.deadlines[index] = deadline_ms;
                self.kinds[index] = kind;
                self.targets[index] = Self::fixed(&target, handshake_core::TARGET_WIDTH);
                self.count += 1;
                Ok(())
            }

            // Locks the sum of all milestones and starts the heartbeat.
            control fn fund(&mut self) -> ProgramResult {
                self.require_owner()?;
                if self.deal_status != crate::deal::CREATED || self.count == 0 {
                    return Err(ProgramError::InvalidArgument);
                }
                let count = self.count as usize;
                let sum = handshake_core::total(&self.amounts, count)
                    .ok_or(ProgramError::InvalidArgument)?;
                self.deposit(sum)?;
                self.remaining = sum;
                for i in 0..count {
                    self.status[i] = handshake_core::phase::FUNDED;
                }
                self.deal_status = crate::deal::FUNDED;
                let buyer = self.owner;
                let payee = self.payee;
                let target = self.now_ms()?.saturating_add(crate::BEAT_MS);
                AFTER target CALL [beat buyer: buyer payee: payee];
                msg!("handshake funded: {} kelvin over {} milestones", sum, count);
                Ok(())
            }

            // Buyer confirms a milestone early. The payout runs in a timer
            // handler so the payee account is declared on that handler.
            control fn approve(&mut self, index: u64) -> ProgramResult {
                self.require_owner()?;
                if index >= self.count || self.deal_status != crate::deal::FUNDED {
                    return Err(ProgramError::InvalidArgument);
                }
                let buyer = self.owner;
                let payee = self.payee;
                let target = self.now_ms()?.saturating_add(1_000);
                AFTER target CALL [approved_payout buyer: buyer payee: payee index: index];
                Ok(())
            }

            // ---------------------------------------------------------------
            // Timer and REX handlers (nobody off-chain calls these)
            // ---------------------------------------------------------------

            handler fn beat(&mut self, buyer: Pubkey, payee: Pubkey) -> ProgramResult {
                if self.deal_status != crate::deal::FUNDED {
                    return Ok(());
                }
                if buyer != self.owner || payee != self.payee {
                    return Err(ProgramError::InvalidArgument);
                }
                let count = self.count as usize;
                if !handshake_core::any_open(&self.status, count) {
                    return Ok(()); // everything settled: the heartbeat ends here
                }
                let now = self.now_ms()?;
                // Rescue a check whose report never arrived: retry, then refund.
                if let Some(stuck) = handshake_core::stuck_check(&self.status, &self.started, count, now) {
                    let index = stuck as u64;
                    let target = now.saturating_add(1_000);
                    self.started[stuck] = now; // do not re-trigger on the next tick
                    if handshake_core::should_retry(self.checks[stuck]) {
                        msg!("handshake: check {} timed out, retrying", index);
                        AFTER target CALL [run_check buyer: buyer payee: payee index: index];
                    } else {
                        msg!("handshake: check {} timed out for good, refunding", index);
                        AFTER target CALL [expire_check buyer: buyer payee: payee index: index];
                    }
                } else if let Some(due) = handshake_core::next_due(&self.status, &self.deadlines, count, now) {
                    self.status[due] = handshake_core::phase::CHECKING;
                    self.started[due] = now;
                    let index = due as u64;
                    msg!("handshake: milestone {} is due, starting its check", index);
                    let target = now.saturating_add(1_000);
                    AFTER target CALL [run_check buyer: buyer payee: payee index: index];
                }
                let target = now.saturating_add(crate::BEAT_MS);
                AFTER target CALL [beat buyer: buyer payee: payee];
                Ok(())
            }

            // The REX request lives in its own timer branch so every check gets
            // fresh REX and subscription PDAs.
            handler fn run_check(&mut self, buyer: Pubkey, payee: Pubkey, index: u64) -> ProgramResult {
                let i = index as usize;
                if i >= 4 || self.status[i] != handshake_core::phase::CHECKING {
                    return Ok(());
                }
                if buyer != self.owner || payee != self.payee {
                    return Err(ProgramError::InvalidArgument);
                }
                self.require_authorized_rex()?;
                // Record the report PDA this request will land in, so on_check
                // can reject any other account passed as the report.
                let rex_nonce = super::interface::multi_account_slug(
                    &self.workflow_pda(),
                    self.branch_number,
                    self.rex_accounts_block_index,
                );
                self.report_pda = derive_report_address(self.payer_account().key, rex_nonce).0;
                self.checks[i] = self.checks[i].saturating_add(1);
                self.started[i] = self.now_ms()?;
                let kind_tag = self.kinds[i].to_string();
                let target_text = self.targets[i].trim_end_matches('\0').to_string();
                msg!("handshake check #{} for milestone {}", self.checks[i], index);
                AFTER report = [verify
                    kind: kind_tag
                    target: target_text
                    request_delay_ms: 5_000u64
                ]
                CALL [on_check buyer: buyer payee: payee index: index report: report];
                Ok(())
            }

            // Venus 0.18.1: the event payload must be the last handler argument.
            handler fn on_check(
                &mut self,
                buyer: Pubkey,
                payee: Pubkey,
                index: u64,
                report: RexReport,
            ) -> ProgramResult {
                let _ = WriteAccountInfo::from(buyer);
                let _ = WriteAccountInfo::from(payee);
                let i = index as usize;
                if i >= 4 || self.status[i] != handshake_core::phase::CHECKING {
                    return Ok(());
                }
                if buyer != self.owner || payee != self.payee {
                    return Err(ProgramError::InvalidArgument);
                }
                let report_account = &self.accounts[self.triggering_event_account_index];
                if report_account.key != &self.report_pda
                    || report_account.owner != &rialo_rex_processor_interface::ID
                    || report.rex_id.creator != self.owner
                {
                    msg!("handshake rejected report: not this check's REX report account");
                    return Err(ProgramError::InvalidAccountData);
                }
                let verdict = self.verdict(&report, i);
                msg!("handshake on_check milestone {}: {} updates, verdict {}", index, report.updates.len(), verdict);
                if verdict == handshake_core::VERDICT_MET {
                    return self.finish(i, handshake_core::Outcome::Pay);
                }
                if verdict == handshake_core::VERDICT_NOT_MET {
                    msg!("handshake: validators agree milestone {} was not met", index);
                    return self.finish(i, handshake_core::Outcome::Refund);
                }
                if !handshake_core::should_retry(self.checks[i]) {
                    msg!("handshake: no conclusive check for milestone {}, refunding", index);
                    return self.finish(i, handshake_core::Outcome::Refund);
                }
                let target = self.now_ms()?.saturating_add(crate::RETRY_MS);
                AFTER target CALL [run_check buyer: buyer payee: payee index: index];
                Ok(())
            }

            // Final fallback for a check that never produced a usable report:
            // refund this milestone to the buyer.
            handler fn expire_check(
                &mut self,
                buyer: Pubkey,
                payee: Pubkey,
                index: u64,
            ) -> ProgramResult {
                let _ = WriteAccountInfo::from(buyer);
                let _ = WriteAccountInfo::from(payee);
                let i = index as usize;
                if i >= 4 || self.status[i] != handshake_core::phase::CHECKING {
                    return Ok(());
                }
                if buyer != self.owner || payee != self.payee {
                    return Err(ProgramError::InvalidArgument);
                }
                self.finish(i, handshake_core::Outcome::Refund)
            }

            handler fn approved_payout(
                &mut self,
                buyer: Pubkey,
                payee: Pubkey,
                index: u64,
            ) -> ProgramResult {
                let _ = WriteAccountInfo::from(buyer);
                let _ = WriteAccountInfo::from(payee);
                let i = index as usize;
                if i >= 4 {
                    return Ok(());
                }
                if buyer != self.owner || payee != self.payee {
                    return Err(ProgramError::InvalidArgument);
                }
                self.finish(i, handshake_core::Outcome::Pay)
            }

            // ---------------------------------------------------------------
            // Internals
            // ---------------------------------------------------------------

            // Turns the raw REX report into a verdict via handshake-core. Every
            // raw update is passed through, so one malformed update can never
            // make a report look unanimous.
            fn verdict(&self, report: &RexReport, i: usize) -> u64 {
                let mut outputs: Vec<Option<Vec<u8>>> = Vec::new();
                let mut n = 0usize;
                for update in &report.updates {
                    n += 1;
                    let mut item: Option<Vec<u8>> = None;
                    if let Ok(output) = update.try_data_as_output() {
                        if let RexOutput::Success(response) = output {
                            if let RexData::Raw(payload) = response.response {
                                if n <= 2 {
                                    let end = payload.len().min(120);
                                    msg!("handshake update {}: {}", n, String::from_utf8_lossy(&payload[..end]));
                                }
                                item = Some(payload);
                            } else if n <= 2 {
                                msg!("handshake update {}: success but not raw data", n);
                            }
                        } else if n <= 2 {
                            msg!("handshake update {}: not a success output", n);
                        }
                    } else if n <= 2 {
                        msg!("handshake update {}: undecodable output", n);
                    }
                    outputs.push(item);
                }
                let target = self.targets[i].trim_end_matches('\0');
                handshake_core::classify(&outputs, self.kinds[i], target)
            }

            // Settles milestone `i` exactly once and moves the funds. A late,
            // repeated, or forged call finds the milestone closed and does
            // nothing.
            fn finish(&mut self, i: usize, outcome: handshake_core::Outcome) -> ProgramResult {
                if i >= 4
                    || (self.status[i] != handshake_core::phase::FUNDED
                        && self.status[i] != handshake_core::phase::CHECKING)
                {
                    return Ok(());
                }
                let recipient = if outcome == handshake_core::Outcome::Pay { self.payee } else { self.owner };
                let account = self.account(&recipient)?;
                // A program account cannot be credited: refund the buyer instead.
                let (outcome, account) = if outcome == handshake_core::Outcome::Pay && account.executable {
                    msg!("handshake: payee cannot be credited, refunding the buyer");
                    let owner = self.owner;
                    (handshake_core::Outcome::Refund, self.account(&owner)?)
                } else {
                    (outcome, account)
                };
                let amount = handshake_core::settle(
                    &mut self.status,
                    &self.amounts,
                    &mut self.remaining,
                    i,
                    outcome,
                )
                .map_err(|_| ProgramError::InvalidArgument)?;
                self.release(&account, amount)?;
                msg!("handshake milestone {} settled: {} kelvin", i, amount);
                Ok(())
            }

            // Moves exactly `amount` from the buyer into the escrow PDA.
            fn deposit(&self, amount: u64) -> ProgramResult {
                let payer = self.payer_account().clone();
                let workflow = self.accounts[1].clone();
                if !payer.is_writable || !workflow.is_writable || workflow.owner != self.program_id {
                    return Err(ProgramError::InvalidArgument);
                }
                let system = self
                    .accounts
                    .iter()
                    .find(|account| system_program::check_id(account.key))
                    .cloned()
                    .ok_or(ProgramError::NotEnoughAccountKeys)?;
                invoke(
                    &system_instruction::transfer(payer.key, workflow.key, amount),
                    &[payer, workflow, system],
                )
            }

            // Finds a named account by key; never relies on account position.
            fn account(&self, key: &Pubkey) -> Result<AccountInfo<'account_info>, ProgramError> {
                self.accounts
                    .iter()
                    .find(|account| account.key == key)
                    .cloned()
                    .ok_or(ProgramError::NotEnoughAccountKeys)
            }

            // The only way kelvin leaves the escrow PDA. `settle` has already
            // reduced `remaining` by `amount`, so the PDA must still hold at
            // least rent plus `amount` plus what is left for other milestones.
            fn release(&self, to: &AccountInfo, amount: u64) -> ProgramResult {
                let workflow = &self.accounts[1];
                if workflow.owner != self.program_id
                    || !workflow.is_writable
                    || !to.is_writable
                    || to.key == workflow.key
                {
                    return Err(ProgramError::InvalidArgument);
                }
                let rent = Rent::get()?.minimum_balance(workflow.data_len());
                let balance = workflow.kelvins();
                let needed = rent.saturating_add(amount).saturating_add(self.remaining);
                if balance < needed {
                    msg!("handshake short: balance {} needed {}", balance, needed);
                    return Err(ProgramError::InsufficientFunds);
                }
                let credited = to.kelvins().checked_add(amount).ok_or(ProgramError::InvalidArgument)?;
                **workflow.try_borrow_mut_kelvins()? = balance - amount;
                **to.try_borrow_mut_kelvins()? = credited;
                Ok(())
            }

            fn require_owner(&self) -> ProgramResult {
                if !self.payer_account().is_signer || self.payer_account().key != &self.owner {
                    return Err(ProgramError::MissingRequiredSignature);
                }
                Ok(())
            }

            // Pins the REX component deployed with this program so nobody can
            // wire a deal to a look-alike verifier.
            fn require_authorized_rex(&self) -> ProgramResult {
                if self.__rex_bytecode_account != Pubkey::from_str_const(crate::AUTHORIZED_REX) {
                    msg!("handshake rejected: unauthorized REX bytecode account");
                    return Err(ProgramError::InvalidAccountData);
                }
                Ok(())
            }

            // DevNet's clock reports Unix milliseconds; normalise if a runtime
            // reports seconds.
            fn now_ms(&self) -> Result<u64, ProgramError> {
                let raw = self.unix_timestamp();
                if raw < 0 {
                    return Err(ProgramError::InvalidArgument);
                }
                if raw < 100_000_000_000 {
                    return Ok((raw as u64).saturating_mul(1_000));
                }
                Ok(raw as u64)
            }

            fn fixed(value: &str, width: usize) -> String {
                let mut out: String = value.chars().take(width).collect();
                while out.len() < width {
                    out.push('\0');
                }
                out
            }
        }
    }
}
