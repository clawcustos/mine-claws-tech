import { neon } from "@neondatabase/serverless";
import {
  createPublicClient,
  http,
  parseAbiItem,
} from "viem";
import { base } from "viem/chains";

// ── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "yl0eEel9mhO_P_ozpzdtZ";
const RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CONTROLLER = "0xe818445e8a04fec223b0e8b2f47139c42d157099" as const;
const PROXY = "0x9B5FD0B02355E954F159F33D7886e4198ee777b9" as const;
const ORACLE_WALLET = "0x19eE9D68cA11Fcf3Db49146b88cAE6E746E67F96".toLowerCase();

const TIER_AMOUNTS = {
  1: BigInt("25000000000000000000000000"),
  2: BigInt("50000000000000000000000000"),
  3: BigInt("100000000000000000000000000"),
};

function getTier(amount: bigint): number {
  if (amount >= TIER_AMOUNTS[3]) return 3;
  if (amount >= TIER_AMOUNTS[2]) return 2;
  if (amount >= TIER_AMOUNTS[1]) return 1;
  return 0;
}

// ── ABIs (minimal) ──────────────────────────────────────────────────────────

const CONTROLLER_ABI = [
  {
    name: "getRound", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "roundId", type: "uint256" },
      { name: "epochId", type: "uint256" },
      { name: "commitOpenAt", type: "uint256" },
      { name: "commitCloseAt", type: "uint256" },
      { name: "revealCloseAt", type: "uint256" },
      { name: "answerHash", type: "bytes32" },
      { name: "questionUri", type: "string" },
      { name: "oracleInscriptionId", type: "uint256" },
      { name: "settled", type: "bool" },
      { name: "expired", type: "bool" },
      { name: "revealedAnswer", type: "string" },
      { name: "correctCount", type: "uint256" },
    ]}],
  },
  {
    name: "roundCount", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    name: "currentEpochId", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    name: "getEpoch", type: "function", stateMutability: "view",
    inputs: [{ name: "epochId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "epochId", type: "uint256" },
      { name: "startAt", type: "uint256" },
      { name: "endAt", type: "uint256" },
      { name: "rewardPool", type: "uint256" },
      { name: "totalCredits", type: "uint256" },
      { name: "settled", type: "bool" },
      { name: "claimDeadline", type: "uint256" },
    ]}],
  },
  {
    name: "getStake", type: "function", stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ type: "tuple", components: [
      { name: "amount", type: "uint256" },
      { name: "withdrawalQueued", type: "bool" },
      { name: "unstakeEpochId", type: "uint256" },
      { name: "stakedIndex", type: "uint256" },
    ]}],
  },
] as const;

const PROXY_ABI = [
  {
    name: "inscriptionAgent", type: "function", stateMutability: "view",
    inputs: [{ name: "inscriptionId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "inscriptionRoundId", type: "function", stateMutability: "view",
    inputs: [{ name: "inscriptionId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getInscriptionContent", type: "function", stateMutability: "view",
    inputs: [{ name: "inscriptionId", type: "uint256" }],
    outputs: [
      { name: "revealed", type: "bool" },
      { name: "content", type: "string" },
      { name: "contentHash", type: "bytes32" },
    ],
  },
] as const;

const ProofInscribedEvent = parseAbiItem(
  "event ProofInscribed(uint256 indexed agentId, bytes32 indexed proofHash, bytes32 prevHash, string blockType, string summary, uint256 cycleCount, bytes32 contentHash, uint256 inscriptionId)"
);

// ── Main ────────────────────────────────────────────────────────────────────

async function backfill() {
  const sql = neon(DATABASE_URL!);
  const client = createPublicClient({ transport: http(RPC_URL), chain: base });

  // Get current epoch and round count
  const [roundCount, currentEpochId] = await Promise.all([
    client.readContract({ address: CONTROLLER, abi: CONTROLLER_ABI, functionName: "roundCount" }),
    client.readContract({ address: CONTROLLER, abi: CONTROLLER_ABI, functionName: "currentEpochId" }),
  ]);

  const totalRounds = Number(roundCount);
  console.log(`Total rounds on-chain: ${totalRounds}, current epoch: ${Number(currentEpochId)}`);

  // Get epoch start block by timestamp
  const epoch = await client.readContract({
    address: CONTROLLER, abi: CONTROLLER_ABI,
    functionName: "getEpoch", args: [currentEpochId],
  });

  const epochStartTs = Number(epoch.startAt);
  console.log(`Epoch ${Number(currentEpochId)} started at timestamp ${epochStartTs}`);

  // Find first round of current epoch
  let firstRound = 1;
  for (let rid = totalRounds; rid >= 1; rid--) {
    await delay(200);
    const round = await client.readContract({
      address: CONTROLLER, abi: CONTROLLER_ABI,
      functionName: "getRound", args: [BigInt(rid)],
    });
    if (Number(round.epochId) < Number(currentEpochId)) {
      firstRound = rid + 1;
      break;
    }
    if (rid === 1) firstRound = 1;
  }

  console.log(`Backfilling rounds ${firstRound}..${totalRounds}`);

  // ── Step 1: Insert rounds ──────────────────────────────────────────────

  for (let rid = firstRound; rid <= totalRounds; rid++) {
    await delay(200);
    const round = await client.readContract({
      address: CONTROLLER, abi: CONTROLLER_ABI,
      functionName: "getRound", args: [BigInt(rid)],
    });

    if (!round.commitOpenAt || round.commitOpenAt === 0n) {
      console.log(`  Round ${rid}: not posted, skipping`);
      continue;
    }

    // Resolve question
    let questionText: string | null = null;
    if (round.oracleInscriptionId && round.oracleInscriptionId > 0n) {
      try {
        const [revealed, content] = await client.readContract({
          address: PROXY, abi: PROXY_ABI,
          functionName: "getInscriptionContent", args: [round.oracleInscriptionId],
        });
        if (revealed && content) {
          try {
            const parsed = JSON.parse(content);
            questionText = parsed.question ?? null;
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    await sql`
      INSERT INTO rounds (
        round_id, epoch_id, commit_open_at, commit_close_at, reveal_close_at,
        answer_hash, oracle_inscription_id, settled, expired, revealed_answer,
        correct_count, question_text
      ) VALUES (
        ${rid},
        ${Number(round.epochId)},
        ${Number(round.commitOpenAt)},
        ${Number(round.commitCloseAt)},
        ${Number(round.revealCloseAt)},
        ${round.answerHash},
        ${Number(round.oracleInscriptionId)},
        ${round.settled},
        ${round.expired},
        ${round.revealedAnswer || null},
        ${Number(round.correctCount)},
        ${questionText}
      )
      ON CONFLICT (round_id) DO UPDATE SET
        settled = EXCLUDED.settled,
        expired = EXCLUDED.expired,
        revealed_answer = EXCLUDED.revealed_answer,
        correct_count = EXCLUDED.correct_count,
        question_text = COALESCE(EXCLUDED.question_text, rounds.question_text),
        updated_at = now()
    `;

    console.log(`  Round ${rid}: inserted (epoch=${Number(round.epochId)}, settled=${round.settled})`);
  }

  // ── Step 2: Scan ProofInscribed logs ───────────────────────────────────

  // Estimate block range from epoch start
  const currentBlock = await client.getBlockNumber();
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const blocksAgo = Math.ceil((currentTimestamp - epochStartTs) / 2); // Base ~2s blocks
  const fromBlock = BigInt(Math.max(Number(currentBlock) - blocksAgo - 500, 0));

  console.log(`\nScanning logs from block ${fromBlock} to ${currentBlock} (~${blocksAgo} blocks)`);

  // Scan in 2000-block chunks
  const CHUNK_SIZE = 2000n;
  const allLogs: Array<{
    args: {
      agentId: bigint;
      proofHash: string;
      prevHash: string;
      blockType: string;
      summary: string;
      cycleCount: bigint;
      contentHash: string;
      inscriptionId: bigint;
    };
    transactionHash: string;
    blockNumber: bigint;
  }> = [];

  for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > currentBlock ? currentBlock : start + CHUNK_SIZE - 1n;
    console.log(`  Scanning blocks ${start}..${end}`);

    try {
      const logs = await client.getLogs({
        address: PROXY,
        event: ProofInscribedEvent,
        fromBlock: start,
        toBlock: end,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allLogs.push(...(logs as any[]));
    } catch (err) {
      console.error(`  Error scanning ${start}..${end}:`, err);
    }
  }

  console.log(`\nFound ${allLogs.length} ProofInscribed events`);

  // Filter mine-related
  const mineLogs = allLogs.filter((log) =>
    log.args.blockType && log.args.blockType.includes("mine")
  );
  console.log(`Mine-related: ${mineLogs.length}`);

  // ── Step 3: Resolve wallets + content via multicall ────────────────────

  // Process in batches to avoid huge multicalls
  const BATCH_SIZE = 50;
  const walletSet = new Set<string>();

  for (let i = 0; i < mineLogs.length; i += BATCH_SIZE) {
    const batch = mineLogs.slice(i, i + BATCH_SIZE);
    const inscriptionIds = batch.map((l) => l.args.inscriptionId);

    console.log(`  Processing inscriptions ${i + 1}..${Math.min(i + BATCH_SIZE, mineLogs.length)}`);

    // Multicall: roundId + wallet + content for each inscription
    const calls = inscriptionIds.flatMap((insId) => [
      { address: PROXY, abi: PROXY_ABI, functionName: "inscriptionRoundId" as const, args: [insId] },
      { address: PROXY, abi: PROXY_ABI, functionName: "inscriptionAgent" as const, args: [insId] },
      { address: PROXY, abi: PROXY_ABI, functionName: "getInscriptionContent" as const, args: [insId] },
    ]);

    let results;
    try {
      results = await client.multicall({ contracts: calls });
    } catch (err) {
      console.error(`  Multicall failed for batch at ${i}, retrying individually...`);
      // Fallback: process individually
      for (const log of batch) {
        try {
          await processInscription(client, sql, log, walletSet);
        } catch (e) {
          console.error(`  Failed inscription ${log.args.inscriptionId}:`, e);
        }
      }
      continue;
    }

    for (let j = 0; j < inscriptionIds.length; j++) {
      const base = j * 3;
      const roundId = results[base]?.result as bigint | undefined;
      const wallet = results[base + 1]?.result as string | undefined;
      const contentResult = results[base + 2]?.result as [boolean, string, string] | undefined;

      if (!roundId || !wallet) continue;

      const walletLower = wallet.toLowerCase();
      if (walletLower === ORACLE_WALLET) continue;

      const roundIdNum = Number(roundId);
      const log = batch[j];
      const revealed = contentResult?.[0] ?? false;
      const content = revealed ? (contentResult?.[1] ?? null) : null;

      // Check correctness
      let correct: boolean | null = null;
      if (revealed && content !== null) {
        const roundRow = await sql`SELECT revealed_answer, settled FROM rounds WHERE round_id = ${roundIdNum}` as Record<string, unknown>[];
        if (roundRow.length > 0 && roundRow[0].settled && roundRow[0].revealed_answer) {
          correct = content.trim() === (roundRow[0].revealed_answer as string).trim();
        }
      }

      await sql`
        INSERT INTO inscriptions (
          inscription_id, round_id, agent_id, wallet, block_type,
          summary, content_hash, proof_hash, prev_hash, cycle_count,
          revealed, content, correct, tx_hash, block_number
        ) VALUES (
          ${Number(log.args.inscriptionId)},
          ${roundIdNum},
          ${Number(log.args.agentId)},
          ${walletLower},
          ${log.args.blockType},
          ${log.args.summary},
          ${log.args.contentHash},
          ${log.args.proofHash},
          ${log.args.prevHash},
          ${Number(log.args.cycleCount)},
          ${revealed},
          ${content},
          ${correct},
          ${log.transactionHash},
          ${Number(log.blockNumber)}
        )
        ON CONFLICT (inscription_id) DO NOTHING
      `;

      walletSet.add(walletLower);
    }
  }

  // ── Step 4: Populate agent_stakes ──────────────────────────────────────

  const wallets = Array.from(walletSet);
  console.log(`\nRefreshing stakes for ${wallets.length} wallets`);

  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE);
    const calls = batch.map((w) => ({
      address: CONTROLLER,
      abi: CONTROLLER_ABI,
      functionName: "getStake" as const,
      args: [w as `0x${string}`],
    }));

    try {
      const results = await client.multicall({ contracts: calls });

      for (let j = 0; j < batch.length; j++) {
        const stake = results[j]?.result as { amount: bigint } | undefined;
        if (!stake) continue;

        const tier = getTier(stake.amount);
        await sql`
          INSERT INTO agent_stakes (wallet, stake_amount, tier, updated_at)
          VALUES (${batch[j]}, ${stake.amount.toString()}, ${tier}, now())
          ON CONFLICT (wallet) DO UPDATE SET
            stake_amount = EXCLUDED.stake_amount,
            tier = EXCLUDED.tier,
            updated_at = now()
        `;
      }
    } catch (err) {
      console.error(`  Stake multicall failed for batch at ${i}:`, err);
    }
  }

  console.log("\nBackfill complete!");
}

/** Fallback: process a single inscription without multicall */
async function processInscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  log: { args: { agentId: bigint; proofHash: string; prevHash: string; blockType: string; summary: string; cycleCount: bigint; contentHash: string; inscriptionId: bigint }; transactionHash: string; blockNumber: bigint },
  walletSet: Set<string>
) {
  const wallet = await client.readContract({
    address: PROXY, abi: PROXY_ABI,
    functionName: "inscriptionAgent", args: [log.args.inscriptionId],
  });

  const walletLower = (wallet as string).toLowerCase();
  if (walletLower === ORACLE_WALLET) return;

  const roundId = await client.readContract({
    address: PROXY, abi: PROXY_ABI,
    functionName: "inscriptionRoundId", args: [log.args.inscriptionId],
  });

  const [revealed, content] = await client.readContract({
    address: PROXY, abi: PROXY_ABI,
    functionName: "getInscriptionContent", args: [log.args.inscriptionId],
  });

  const roundIdNum = Number(roundId);
  const contentVal = revealed ? content : null;

  let correct: boolean | null = null;
  if (revealed && contentVal) {
    const roundRow = await sql`SELECT revealed_answer, settled FROM rounds WHERE round_id = ${roundIdNum}` as Record<string, unknown>[];
    if (roundRow.length > 0 && roundRow[0].settled && roundRow[0].revealed_answer) {
      correct = contentVal.trim() === (roundRow[0].revealed_answer as string).trim();
    }
  }

  await sql`
    INSERT INTO inscriptions (
      inscription_id, round_id, agent_id, wallet, block_type,
      summary, content_hash, proof_hash, prev_hash, cycle_count,
      revealed, content, correct, tx_hash, block_number
    ) VALUES (
      ${Number(log.args.inscriptionId)},
      ${roundIdNum},
      ${Number(log.args.agentId)},
      ${walletLower},
      ${log.args.blockType},
      ${log.args.summary},
      ${log.args.contentHash},
      ${log.args.proofHash},
      ${log.args.prevHash},
      ${Number(log.args.cycleCount)},
      ${revealed},
      ${contentVal},
      ${correct},
      ${log.transactionHash},
      ${Number(log.blockNumber)}
    )
    ON CONFLICT (inscription_id) DO NOTHING
  `;

  walletSet.add(walletLower);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
