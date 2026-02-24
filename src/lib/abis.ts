// ─── CustosMineController ABI ─────────────────────────────────────────────────

export const MINE_CONTROLLER_ABI = [
  // Staking
  { type: "function", name: "stake",         inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unstake",        inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "cancelUnstake",  inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "withdrawStake",  inputs: [], outputs: [], stateMutability: "nonpayable" },

  // Participation — inscription-based commit/reveal
  {
    type: "function",
    name: "registerCommit",
    inputs: [
      { name: "roundId",       type: "uint256" },
      { name: "inscriptionId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerCommitReveal",
    inputs: [
      { name: "roundIdCommit", type: "uint256" },
      { name: "inscriptionId", type: "uint256" },
      { name: "roundIdReveal", type: "uint256" },
      { name: "answer",        type: "string"  },
      { name: "salt",          type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerReveal",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "answer",  type: "string"  },
      { name: "salt",    type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // Claim
  { type: "function", name: "claimEpochReward", inputs: [{ name: "epochId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },

  // View — epoch/round state
  {
    type: "function", name: "getCurrentRound", inputs: [], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "roundId", type: "uint256" }, { name: "epochId", type: "uint256" },
      { name: "commitOpenAt", type: "uint256" }, { name: "commitCloseAt", type: "uint256" },
      { name: "revealCloseAt", type: "uint256" }, { name: "answerHash", type: "bytes32" },
      { name: "questionUri", type: "string" }, { name: "settled", type: "bool" },
      { name: "expired", type: "bool" }, { name: "batchSettling", type: "bool" },
      { name: "revealedAnswer", type: "string" }, { name: "correctCount", type: "uint256" },
      { name: "revealCount", type: "uint256" },
    ]}],
  },
  {
    type: "function", name: "getRound",
    inputs: [{ name: "roundId", type: "uint256" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "roundId", type: "uint256" }, { name: "epochId", type: "uint256" },
      { name: "commitOpenAt", type: "uint256" }, { name: "commitCloseAt", type: "uint256" },
      { name: "revealCloseAt", type: "uint256" }, { name: "answerHash", type: "bytes32" },
      { name: "questionUri", type: "string" }, { name: "settled", type: "bool" },
      { name: "expired", type: "bool" }, { name: "batchSettling", type: "bool" },
      { name: "revealedAnswer", type: "string" }, { name: "correctCount", type: "uint256" },
      { name: "revealCount", type: "uint256" },
    ]}],
  },
  {
    type: "function", name: "getEpoch",
    inputs: [{ name: "epochId", type: "uint256" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "epochId", type: "uint256" }, { name: "startAt", type: "uint256" },
      { name: "endAt", type: "uint256" }, { name: "rewardPool", type: "uint256" },
      { name: "totalCredits", type: "uint256" }, { name: "settled", type: "bool" },
      { name: "claimDeadline", type: "uint256" },
    ]}],
  },
  {
    type: "function", name: "getStake",
    inputs: [{ name: "wallet", type: "address" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [
      { name: "amount", type: "uint256" }, { name: "withdrawalQueued", type: "bool" },
      { name: "unstakeEpochId", type: "uint256" }, { name: "stakedIndex", type: "uint256" },
    ]}],
  },
  { type: "function", name: "getClaimable",    inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getTierSnapshot", inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getCredits",      inputs: [{ name: "wallet", type: "address" }, { name: "epochId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getSubmission",   inputs: [{ name: "roundId", type: "uint256" }, { name: "wallet", type: "address" }], outputs: [{ type: "tuple", components: [
    { name: "commitInscriptionId", type: "uint256" }, { name: "revealedAnswer", type: "string" },
    { name: "committed", type: "bool" }, { name: "revealed", type: "bool" }, { name: "credited", type: "bool" },
  ]}], stateMutability: "view" },

  // View — state
  { type: "function", name: "epochOpen",          inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "epochClosing",        inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "currentEpochId",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "roundCount",          inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "rewardBuffer",        inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "snapshotComplete",    inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
  { type: "function", name: "tier1Threshold",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tier2Threshold",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tier3Threshold",      inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getStakedAgentCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getPendingRevealCount", inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "paused",              inputs: [], outputs: [{ type: "bool"    }], stateMutability: "view" },
] as const;

// ─── CustosNetworkProxy ABI (inscription + verification) ──────────────────────
// Agents must inscribe here BEFORE calling registerCommit on MineController.
// The inscriptionId returned is what gets passed to registerCommit.

export const CUSTOS_PROXY_ABI = [
  // Inscribe — costs 0.1 USDC (must approve USDC to proxy first)
  {
    type: "function",
    name: "inscribe",
    inputs: [
      { name: "blockType",   type: "string"  }, // "mine-commit"
      { name: "summary",     type: "string"  }, // human-readable label e.g. "mine round 5"
      { name: "contentHash", type: "bytes32" }, // keccak256(abi.encodePacked(answer, salt))
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // View — used by MineController for verification
  { type: "function", name: "inscriptionContentHash", inputs: [{ name: "inscriptionId", type: "uint256" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "inscriptionAgent",       inputs: [{ name: "inscriptionId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "agentIdByWallet",        inputs: [{ name: "wallet",        type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "inscriptionCount",       inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  // Event emitted on inscribe — inscriptionId is in the event
  {
    type: "event",
    name: "ProofInscribed",
    inputs: [
      { name: "agentId",      type: "uint256", indexed: true  },
      { name: "proofHash",    type: "bytes32", indexed: true  },
      { name: "prevHash",     type: "bytes32", indexed: false },
      { name: "blockType",    type: "string",  indexed: false },
      { name: "summary",      type: "string",  indexed: false },
      { name: "cycleCount",   type: "uint256", indexed: false },
      { name: "contentHash",  type: "bytes32", indexed: false },
      { name: "inscriptionId",type: "uint256", indexed: false },
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
