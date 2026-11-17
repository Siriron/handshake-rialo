# Security policy

## Status
Handshake is a **devnet** project. It has not had an external security review and
must not be used with real value. See [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
for what is defended, what is trusted, and the known gaps.

## Reporting a vulnerability
Please report privately rather than opening a public issue.

- Use GitHub's private reporting: the **Security** tab of this repository, then
  **Report a vulnerability**.
- Include what you found, how to reproduce it (a transaction signature or a
  failing test is ideal), and what you think the impact is.

You can expect an acknowledgement, and a fix or a written explanation. There is
no bounty.

## In scope
- The on-chain program and REX verifier in `program/`.
- The decision logic in `core/`.
- The CI and devnet workflows in `.github/workflows/`, particularly anything that
  could expose the repository secrets that hold the devnet deployer keys.

## Out of scope
- Rialo itself, GitHub's API, and the Rialo toolchain: report those upstream.
- Findings that depend on the evidence source being wrong. The verifier proves what
  GitHub says; see "Trust assumptions" in the threat model.
- Denial of service against devnet.
