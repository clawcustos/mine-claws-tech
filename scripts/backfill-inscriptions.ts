import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { base } from "viem/chains";
import { CUSTOS_PROXY_ABI } from "../src/lib/abis";
import { CONTRACTS } from "../src/lib/constants";
import { getDb } from "../src/lib/db";

const RPC_URL = "https://mainnet.base.org";
const client = createPublicClient({ transport: http(RPC_URL), chain: base });
const sql = getDb();

const ORACLE_WALLET = "0x19ee9d68ca11fcf3db49146b88cae6e746e67f96";
const PROXY_ADDR = CONTRACTS.CUSTOS_PROXY as `0x${string}`;
const CHUNK = 9999n;

async function main() {
  const existing = await sql`SELECT inscription_id FROM inscriptions`;
  const existingIds = new Set(existing.map((r) => Number(r.inscription_id)));
  console.log("Existing inscriptions in DB:", existingIds.size);

  const event = parseAbiItem(
    "event ProofInscribed(uint256 indexed agentId, bytes32 indexed proofHash, bytes32 prevHash, string blockType, string summary, uint256 cycleCount, bytes32 contentHash, uint256 inscriptionId)",
  );

  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - 200000n;
  console.log("Scanning blocks", startBlock.toString(), "to", currentBlock.toString());

  // Fetch logs in chunks of 9999 blocks
  const allLogs: Log[] = [];
  for (let from = startBlock; from <= currentBlock; from += CHUNK + 1n) {
    const to = from + CHUNK > currentBlock ? currentBlock : from + CHUNK;
    const chunk = await client.getLogs({
      address: PROXY_ADDR,
      event,
      fromBlock: from,
      toBlock: to,
    });
    allLogs.push(...(chunk as unknown as Log[]));
    if (chunk.length > 0) {
      console.log(`  chunk ${from}-${to}: ${chunk.length} events`);
    }
  }

  console.log("Total ProofInscribed events found:", allLogs.length);

  let inserted = 0;
  let skippedOracle = 0;
  let skippedExisting = 0;
  let skippedNonMine = 0;

  for (const log of allLogs) {
    const args = (log as any).args;
    if (!args?.inscriptionId || !args?.blockType) continue;

    if (!args.blockType.includes("mine")) {
      skippedNonMine++;
      continue;
    }

    const inscriptionId = Number(args.inscriptionId);
    if (existingIds.has(inscriptionId)) {
      skippedExisting++;
      continue;
    }

    try {
      const wallet = await client.readContract({
        address: PROXY_ADDR,
        abi: CUSTOS_PROXY_ABI,
        functionName: "inscriptionAgent",
        args: [args.inscriptionId],
      });

      const walletLower = (wallet as string).toLowerCase();
      if (walletLower === ORACLE_WALLET) {
        skippedOracle++;
        continue;
      }

      const roundId = await client.readContract({
        address: PROXY_ADDR,
        abi: CUSTOS_PROXY_ABI,
        functionName: "inscriptionRoundId",
        args: [args.inscriptionId],
      });
      const roundIdNum = Number(roundId);

      const [revealed, content] = await client.readContract({
        address: PROXY_ADDR,
        abi: CUSTOS_PROXY_ABI,
        functionName: "getInscriptionContent",
        args: [args.inscriptionId],
      });

      let correct: boolean | null = null;
      const roundRows =
        await sql`SELECT revealed_answer, settled FROM rounds WHERE round_id = ${roundIdNum}`;
      if (
        roundRows.length > 0 &&
        roundRows[0].settled &&
        roundRows[0].revealed_answer &&
        revealed &&
        content
      ) {
        correct =
          content.trim() === (roundRows[0].revealed_answer as string).trim();
      }

      await sql`
        INSERT INTO inscriptions (
          inscription_id, round_id, agent_id, wallet, block_type,
          summary, content_hash, proof_hash, prev_hash, cycle_count,
          revealed, content, correct, tx_hash, block_number
        ) VALUES (
          ${inscriptionId},
          ${roundIdNum},
          ${Number(args.agentId)},
          ${walletLower},
          ${args.blockType},
          ${args.summary || ""},
          ${args.contentHash || ""},
          ${""},
          ${args.prevHash || ""},
          ${Number(args.cycleCount || 0)},
          ${revealed},
          ${revealed ? content : null},
          ${correct},
          ${log.transactionHash || null},
          ${log.blockNumber ? Number(log.blockNumber) : null}
        )
        ON CONFLICT (inscription_id) DO UPDATE SET
          revealed = EXCLUDED.revealed,
          content = EXCLUDED.content,
          correct = EXCLUDED.correct
      `;

      inserted++;
      existingIds.add(inscriptionId);
      console.log(
        "Inserted inscription",
        inscriptionId,
        "| round:",
        roundIdNum,
        "| wallet:",
        walletLower.substring(0, 10),
        "| revealed:",
        revealed,
      );
    } catch (e: any) {
      console.error(
        "Error processing inscription",
        inscriptionId,
        ":",
        e.shortMessage || e.message,
      );
    }
  }

  console.log("\n=== Backfill Summary ===");
  console.log("Inserted:", inserted);
  console.log("Skipped existing:", skippedExisting);
  console.log("Skipped oracle:", skippedOracle);
  console.log("Skipped non-mine:", skippedNonMine);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
