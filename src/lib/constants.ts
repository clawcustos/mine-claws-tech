// Contract addresses (Base mainnet — V5 controller deployed 2026-02-25)
export const CONTRACTS = {
  MINE_CONTROLLER: "0xd90C5266077254E607B0908be092aB9aCe70323a", // V5 — rolling 10min windows, oracle inscription enforcement
  MINE_REWARDS:    "0x43fB5616A1b4Df2856dea2EC4A3381189d5439e7",
  CUSTOS_TOKEN:    "0xF3e20293514d775a3149C304820d9E6a6FA29b07",
  CUSTOS_PROXY:    "0x9B5FD0B02355E954F159F33D7886e4198ee777b9",
  USDC:            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH:            "0x4200000000000000000000000000000000000006",
} as const;

export const CHAIN_ID = 8453;
export const RPC_URL = "https://mainnet.base.org";
export const BASESCAN = "https://basescan.org";

// Tier thresholds (raw token units — 18 decimals)
export const TIER_AMOUNTS = {
  1: BigInt("25000000000000000000000000"),  // 25M
  2: BigInt("50000000000000000000000000"),  // 50M
  3: BigInt("100000000000000000000000000"), // 100M
} as const;

export const TIER_LABELS = {
  0: "Unstaked",
  1: "Tier 1 — 25M",
  2: "Tier 2 — 50M",
  3: "Tier 3 — 100M",
} as const;

export const TIER_MULTIPLIERS = { 0: 0, 1: 1, 2: 2, 3: 3 } as const;

// Timing constants (matches contract)
export const ROUNDS_PER_EPOCH = 140;
export const COMMIT_WINDOW = 600; // 10 min
export const REVEAL_WINDOW = 600; // 10 min (next loop)
export const EPOCH_DURATION = 86400; // 24h
export const CLAIM_WINDOW_DAYS = 30;

// LocalStorage key for commit salt
export const commitSaltKey = (roundId: bigint, wallet: string) =>
  `mine_commit_${roundId}_${wallet.toLowerCase()}`;
