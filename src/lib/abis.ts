// ─── CustosMineController ABI ─────────────────────────────────────────────────
// Deployed at 0xe818445e8a04fec223b0e8b2f47139c42d157099
// Round struct (VERIFIED via raw ABI decode of on-chain call):
//   roundId, epochId, commitOpenAt, commitCloseAt, revealCloseAt,
//   answerHash(bytes32), questionUri(string), oracleInscriptionId(uint256),
//   settled(bool), expired(bool), revealedAnswer(string), correctCount(uint256)
// postRound(string, bytes32, uint256) — selector 0xb35f5e90 (verified from tx)
// settleRound(uint256, string, uint256[]) — selector 0xdcd5151f (verified from tx)

export const MINE_CONTROLLER_ABI = [
  // Staking
  { type: "function", name: "stake",         inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unstake",        inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "cancelUnstake",  inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "withdrawStake",  inputs: [], outputs: [], stateMutability: "nonpayable" },

  // Reward pool (custodian / MineRewards pipeline)
  { type: "function", name: "depositRewards", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "receiveCustos",  inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },

  // Claim
  { type: "function", name: "claimEpochReward", inputs: [{ name: "epochId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },

  // View — epoch/round state
  {
    type: "function", name: "getCurrentRound", inputs: [], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "roundId",             type: "uint256" },
      { name: "epochId",             type: "uint256" },
      { name: "commitOpenAt",        type: "uint256" },
      { name: "commitCloseAt",       type: "uint256" },
      { name: "revealCloseAt",       type: "uint256" },
      { name: "answerHash",          type: "bytes32" },
      { name: "questionUri",         type: "string"  },
      { name: "oracleInscriptionId", type: "uint256" },
      { name: "settled",             type: "bool"    },
      { name: "expired",             type: "bool"    },
      { name: "revealedAnswer",      type: "string"  },
      { name: "correctCount",        type: "uint256" },
    ]}],
  },
  {
    type: "function", name: "getRound",
    inputs: [{ name: "roundId", type: "uint256" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "roundId",             type: "uint256" },
      { name: "epochId",             type: "uint256" },
      { name: "commitOpenAt",        type: "uint256" },
      { name: "commitCloseAt",       type: "uint256" },
      { name: "revealCloseAt",       type: "uint256" },
      { name: "answerHash",          type: "bytes32" },
      { name: "questionUri",         type: "string"  },
      { name: "oracleInscriptionId", type: "uint256" },
      { name: "settled",             type: "bool"    },
      { name: "expired",             type: "bool"    },
      { name: "revealedAnswer",      type: "string"  },
      { name: "correctCount",        type: "uint256" },
    ]}],
  },
  {
    type: "function", name: "getEpoch",
    inputs: [{ name: "epochId", type: "uint256" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "epochId",       type: "uint256" },
      { name: "startAt",       type: "uint256" },
      { name: "endAt",         type: "uint256" },
      { name: "rewardPool",    type: "uint256" },
      { name: "totalCredits",  type: "uint256" },
      { name: "settled",       type: "bool"    },
      { name: "claimDeadline", type: "uint256" },
    ]}],
  },
  {
    type: "function", name: "getStake",
    inputs: [{ name: "wallet", type: "address" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "amount",           type: "uint256" },
      { name: "withdrawalQueued", type: "bool"    },
      { name: "unstakeEpochId",   type: "uint256" },
      { name: "stakedIndex",      type: "uint256" },
    ]}],
  },
  { type: "function", name: "getClaimable",    inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getTierSnapshot", inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getCredits",      inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getPreviewReward",inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },

  // View — contract state
  { type: "function", name: "epochOpen",          inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "currentEpochId",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "roundCount",          inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "rewardBuffer",        inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "snapshotComplete",    inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "tier1Threshold",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tier2Threshold",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tier3Threshold",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getStakedAgentCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "paused",              inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
] as const;

// ─── CustosNetworkProxy ABI (inscription + reveal) ────────────────────────────
// Agents inscribe mine-commit here. The inscriptionId from ProofInscribed event
// is what the oracle collects and passes to settleRound().

export const CUSTOS_PROXY_ABI = [
  // Full inscribe signature (used by oracle and agents via CLI)
  {
    type: "function",
    name: "inscribe",
    inputs: [
      { name: "proofHash",   type: "bytes32" },
      { name: "prevHash",    type: "bytes32" },
      { name: "blockType",   type: "string"  }, // "mine-commit" for agents
      { name: "summary",     type: "string"  },
      { name: "contentHash", type: "bytes32" }, // keccak256(abi.encodePacked(answer, salt))
      { name: "roundId",     type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Reveal (used by oracle at settle time, and agents post-commit window)
  {
    type: "function",
    name: "reveal",
    inputs: [
      { name: "inscriptionId", type: "uint256" },
      { name: "content",       type: "string"  },
      { name: "salt",          type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // View
  { type: "function", name: "inscriptionContentHash",  inputs: [{ name: "inscriptionId", type: "uint256" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "inscriptionRevealTime",   inputs: [{ name: "inscriptionId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "inscriptionRoundId",      inputs: [{ name: "inscriptionId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "agentIdByWallet",         inputs: [{ name: "wallet",        type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "inscriptionCount",        inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  // ProofInscribed event — inscriptionId is the last field in log data
  {
    type: "event",
    name: "ProofInscribed",
    inputs: [
      { name: "agentId",       type: "uint256", indexed: true  },
      { name: "proofHash",     type: "bytes32", indexed: true  },
      { name: "prevHash",      type: "bytes32", indexed: false },
      { name: "blockType",     type: "string",  indexed: false },
      { name: "summary",       type: "string",  indexed: false },
      { name: "cycleCount",    type: "uint256", indexed: false },
      { name: "contentHash",   type: "bytes32", indexed: false },
      { name: "inscriptionId", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── ERC20 ABI ────────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  { type: "function", name: "approve",   inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner",   type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "decimals",  inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const;
