import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getDb } from "@/lib/db";
import { CONTRACTS, RPC_URL as DEFAULT_RPC_URL } from "@/lib/constants";
import { MINE_CONTROLLER_ABI, CUSTOS_PROXY_ABI } from "@/lib/abis";

export const dynamic = "force-dynamic";

const RPC_URL = (process.env.BASE_RPC_URL || DEFAULT_RPC_URL).replace(/\s/g, "");
const ORACLE_WALLET = "0x19ee9d68ca11fcf3db49146b88cae6e746e67f96";

function getClient() {
  return createPublicClient({ transport: http(RPC_URL), chain: base });
}

/* ------------------------------------------------------------------ */
/*  In-memory cache — bypasses Neon pooler stale-read issues entirely */
/* ------------------------------------------------------------------ */
interface CachedAgent {
  inscriptionId: number;
  wallet: string;
  revealed: boolean;
  content: string | null;
}

interface CacheEntry {
  settled: boolean;
  expired: boolean;
  commitCloseAt: number;
  revealCloseAt: number;
  revealedAnswer: string | null;
  correctCount: number;
  questionText: string | null;
  oracleInscriptionId: number;
  agents: CachedAgent[];
  ts: number;
}

const cache = new Map<number, CacheEntry>();
const CACHE_TTL_COMPLETE = 300_000; // 5 min — settled + corrects populated
const CACHE_TTL_SETTLED  = 8_000;   // 8s — settled but corrects not yet computed (reveals still propagating)
const CACHE_TTL_ACTIVE   = 4_000;   // 4s — active rounds refresh often

function isFresh(entry: CacheEntry): boolean {
  const age = Date.now() - entry.ts;
  if (entry.settled || entry.expired) {
    // Only long-cache if we have revealed answers to compute correct flags from.
    // A round cached right before settlement has revealedAnswer=null — keep refreshing.
    const hasReveals = entry.revealedAnswer && entry.agents.some((a) => a.revealed && a.content);
    return age < (hasReveals ? CACHE_TTL_COMPLETE : CACHE_TTL_SETTLED);
  }
  return age < CACHE_TTL_ACTIVE;
}

/* ------------------------------------------------------------------ */
/*  Fetch round + inscriptions from chain via multicall (2-3 RPC calls) */
/* ------------------------------------------------------------------ */
async function fetchFromChain(roundId: number): Promise<CacheEntry | null> {
  const client = getClient();
  const addr = {
    controller: CONTRACTS.MINE_CONTROLLER as `0x${string}`,
    proxy: CONTRACTS.CUSTOS_PROXY as `0x${string}`,
  };

  // 1. Get round data (single RPC)
  const round = await client.readContract({
    address: addr.controller,
    abi: MINE_CONTROLLER_ABI,
    functionName: "getRound",
    args: [BigInt(roundId)],
  });

  if (!round.commitOpenAt || round.commitOpenAt === 0n) return null;

  const oracleId = Number(round.oracleInscriptionId);

  // 2. Get question text from oracle inscription
  let questionText: string | null = null;
  if (oracleId > 0) {
    try {
      const [revealed, content] = await client.readContract({
        address: addr.proxy,
        abi: CUSTOS_PROXY_ABI,
        functionName: "getInscriptionContent",
        args: [round.oracleInscriptionId],
      });
      if (revealed && content) {
        try {
          questionText = JSON.parse(content).question ?? null;
        } catch { /* malformed JSON */ }
      }
    } catch { /* oracle inscription not yet available */ }
  }

  // 3. Scan for agent inscriptions via multicall
  const agents: CachedAgent[] = [];
  if (oracleId > 0) {
    // Agents inscribe after the oracle; with 20+ miners + interleaved rounds,
    // IDs can spread 40-50+ beyond the oracle inscription.
    const start = Math.max(1, oracleId - 2);
    const end = oracleId + 60;
    const candidateIds = Array.from(
      { length: end - start + 1 },
      (_, i) => start + i
    );

    // Batch 1: get roundId for all candidate inscription IDs (single RPC)
    const roundIdResults = await client.multicall({
      contracts: candidateIds.map((i) => ({
        address: addr.proxy,
        abi: CUSTOS_PROXY_ABI,
        functionName: "inscriptionRoundId" as const,
        args: [BigInt(i)],
      })),
      allowFailure: true,
    });

    const matchingIds = candidateIds.filter((_, idx) => {
      const r = roundIdResults[idx];
      return r.status === "success" && Number(r.result) === roundId;
    });

    if (matchingIds.length > 0) {
      // Batch 2: get wallet + content for all matches (single RPC)
      const detailResults = await client.multicall({
        contracts: matchingIds.flatMap((i) => [
          {
            address: addr.proxy,
            abi: CUSTOS_PROXY_ABI,
            functionName: "inscriptionAgent" as const,
            args: [BigInt(i)],
          },
          {
            address: addr.proxy,
            abi: CUSTOS_PROXY_ABI,
            functionName: "getInscriptionContent" as const,
            args: [BigInt(i)],
          },
        ]),
        allowFailure: true,
      });

      for (let j = 0; j < matchingIds.length; j++) {
        const walletResult = detailResults[j * 2];
        const contentResult = detailResults[j * 2 + 1];
        if (walletResult.status !== "success") continue;

        const wallet = (walletResult.result as string).toLowerCase();
        if (wallet === ORACLE_WALLET) continue;

        let revealed = false;
        let content: string | null = null;
        if (contentResult.status === "success") {
          const [rev, cnt] = contentResult.result as [boolean, string, string];
          revealed = rev;
          content = revealed ? cnt : null;
        }

        agents.push({
          inscriptionId: matchingIds[j],
          wallet,
          revealed,
          content,
        });
      }
    }
  }

  const entry: CacheEntry = {
    settled: round.settled,
    expired: round.expired,
    commitCloseAt: Number(round.commitCloseAt),
    revealCloseAt: Number(round.revealCloseAt),
    revealedAnswer: round.revealedAnswer || null,
    correctCount: Number(round.correctCount),
    questionText,
    oracleInscriptionId: oracleId,
    agents,
    ts: Date.now(),
  };

  cache.set(roundId, entry);
  return entry;
}

/* ------------------------------------------------------------------ */
/*  Fire-and-forget DB persistence (analytics / long-term storage)     */
/* ------------------------------------------------------------------ */
function persistToDb(roundId: number, entry: CacheEntry) {
  try {
    const sql = getDb();

    sql`
      INSERT INTO rounds (
        round_id, epoch_id, commit_open_at, commit_close_at, reveal_close_at,
        answer_hash, oracle_inscription_id, settled, expired, revealed_answer,
        correct_count, question_text
      ) VALUES (
        ${roundId}, ${0}, ${0}, ${entry.commitCloseAt}, ${entry.revealCloseAt},
        ${""}, ${entry.oracleInscriptionId}, ${entry.settled}, ${entry.expired},
        ${entry.revealedAnswer}, ${entry.correctCount}, ${entry.questionText}
      )
      ON CONFLICT (round_id) DO UPDATE SET
        settled = EXCLUDED.settled,
        expired = EXCLUDED.expired,
        revealed_answer = COALESCE(EXCLUDED.revealed_answer, rounds.revealed_answer),
        correct_count = EXCLUDED.correct_count,
        question_text = COALESCE(EXCLUDED.question_text, rounds.question_text),
        oracle_inscription_id = EXCLUDED.oracle_inscription_id
    `.catch(() => {});

    for (const a of entry.agents) {
      sql`
        INSERT INTO inscriptions (
          inscription_id, round_id, agent_id, wallet, block_type,
          summary, content_hash, proof_hash, prev_hash, cycle_count,
          revealed, content, correct
        ) VALUES (
          ${a.inscriptionId}, ${roundId}, ${0}, ${a.wallet}, ${"mine-commit"},
          ${""}, ${""}, ${""}, ${""}, ${0},
          ${a.revealed}, ${a.content}, ${null}
        )
        ON CONFLICT (inscription_id) DO UPDATE SET
          revealed = EXCLUDED.revealed,
          content = COALESCE(EXCLUDED.content, inscriptions.content)
      `.catch(() => {});
    }
  } catch { /* DB down — no problem, chain is source of truth */ }
}

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const id = parseInt(roundId, 10);

  if (isNaN(id) || id < 1) {
    return NextResponse.json({ error: "Invalid roundId" }, { status: 400 });
  }

  try {
    // 1. Check in-memory cache
    let entry = cache.get(id);
    if (entry && isFresh(entry)) {
      // Serve from cache — 0ms
    } else {
      // 2. Fetch from chain (multicall — ~300-500ms)
      const fetched = await fetchFromChain(id);
      if (!fetched) {
        return NextResponse.json({
          roundId: id,
          phase: "commit",
          question: null,
          revealedAnswer: null,
          correctCount: 0,
          agents: [],
        });
      }
      entry = fetched;
      // 3. Fire-and-forget DB persist
      persistToDb(id, entry);
    }

    // 4. Compute phase
    const now = Math.floor(Date.now() / 1000);
    let phase: string;
    if (entry.settled) phase = "settled";
    else if (entry.expired) phase = "expired";
    else if (now < entry.commitCloseAt) phase = "commit";
    else if (now < entry.revealCloseAt) phase = "reveal";
    else phase = "settling";

    // 5. Get tier data from DB (agent_stakes is stable, no write-after-read issue)
    let tierMap = new Map<string, number>();
    if (entry.agents.length > 0) {
      try {
        const sql = getDb();
        const wallets = entry.agents.map((a) => a.wallet);
        const stakes = await sql`
          SELECT LOWER(wallet) as wallet, tier
          FROM agent_stakes
          WHERE LOWER(wallet) = ANY(${wallets})
        `;
        for (const s of stakes) tierMap.set(s.wallet, Number(s.tier));
      } catch { /* tier data unavailable — default to 0 */ }
    }

    // 6. Compute correct for settled rounds
    const agents = entry.agents.map((a) => {
      let correct: boolean | null = null;
      if (
        (entry!.settled || entry!.expired) &&
        entry!.revealedAnswer &&
        a.revealed &&
        a.content
      ) {
        correct =
          a.content.toLowerCase() === entry!.revealedAnswer.toLowerCase();
      }
      return {
        inscriptionId: a.inscriptionId.toString(),
        wallet: a.wallet,
        revealed: a.revealed,
        content: a.revealed ? a.content : null,
        correct,
        tier: tierMap.get(a.wallet) ?? 0,
      };
    });

    const result = {
      roundId: id,
      phase,
      question: entry.questionText,
      revealedAnswer: entry.revealedAnswer,
      correctCount: entry.correctCount,
      agents,
    };

    const isSettled = entry.settled || entry.expired;
    const correctsPopulated =
      isSettled && agents.some((a) => a.correct !== null);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": correctsPopulated
          ? "public, max-age=3600"
          : "public, max-age=2, stale-while-revalidate=3",
      },
    });
  } catch (err) {
    console.error(`[round-inscriptions API] Error for round ${id}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch round inscriptions" },
      { status: 500 }
    );
  }
}
