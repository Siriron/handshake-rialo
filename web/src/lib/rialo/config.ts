// Facts verified against Rialo devnet (probe run 44246793737) and the repo's core crate.
export const PROGRAM_ID = "5umz6vh9vQ85fJhYrUmDMm6pGYVj5Cr5Tv9RS9GfEf2h";
export const REX_ID = "7pycwurxgfQMaTN9KMbHqn8vCcBzgZhJKvB4epLyjpH3";
export const SUBSCRIBER_INTERFACE = "Subscriber111111111111111111111111111111111";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** Instruction tags from the generated manifest (program/wit/handshake-manifest.json). */
export const TAG = { create: 1, addMilestone: 3, fund: 4, approve: 5 } as const;

export const KELVIN_PER_RLO = 1_000_000_000n;
export const MAX_MILESTONES = 4;
export const MIN_AMOUNT_KELVIN = 10_000_000n;
export const MIN_WINDOW_MS = 60_000;
export const MAX_WINDOW_MS = 86_400_000;
export const MIN_GAP_MS = 30_000;
export const TARGET_WIDTH = 64;
export const DEAL_ACCOUNT_SIZE = 704;

export const KIND = { release: 1n, pullRequest: 2n } as const;
export const PHASE = { created: 0n, funded: 1n, checking: 2n, paid: 3n, refunded: 4n } as const;
