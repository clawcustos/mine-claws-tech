import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

/**
 * GET /api/questions/[roundId]
 *
 * Reads the oracle's question for a given round directly from the chain:
 *   1. MineController.getRound(roundId) → oracleInscriptionId
 *   2. CustosNetworkProxy.getInscriptionContent(oracleInscriptionId) → question JSON
 *
 * No log scanning. No off-chain dependency. Pure contract reads.
 * Returns 404 if round not posted yet, or 202 if posted but question not yet revealed.
 */

const RPC_URL        = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || 'yl0eEel9mhO_P_ozpzdtZ'}`;
const CONTROLLER     = '0xd90C5266077254E607B0908be092aB9aCe70323a' as `0x${string}`;
const PROXY          = '0x9B5FD0B02355E954F159F33D7886e4198ee777b9' as `0x${string}`;

const CONTROLLER_ABI = [
  {
    name: 'getRound', type: 'function' as const, stateMutability: 'view' as const,
    inputs:  [{ name: 'roundId', type: 'uint256' as const }],
    outputs: [{ type: 'tuple' as const, components: [
      { name: 'roundId',             type: 'uint256' as const },
      { name: 'epochId',             type: 'uint256' as const },
      { name: 'commitOpenAt',        type: 'uint256' as const },
      { name: 'commitCloseAt',       type: 'uint256' as const },
      { name: 'revealCloseAt',       type: 'uint256' as const },
      { name: 'answerHash',          type: 'bytes32' as const },
      { name: 'questionUri',         type: 'string'  as const },
      { name: 'oracleInscriptionId', type: 'uint256' as const },
      { name: 'settled',             type: 'bool'    as const },
      { name: 'expired',             type: 'bool'    as const },
      { name: 'revealedAnswer',      type: 'string'  as const },
      { name: 'correctCount',        type: 'uint256' as const },
    ]}],
  },
] as const;

const PROXY_ABI = [
  {
    name: 'getInscriptionContent', type: 'function' as const, stateMutability: 'view' as const,
    inputs:  [{ name: 'inscriptionId', type: 'uint256' as const }],
    outputs: [
      { name: 'revealed',     type: 'bool'    as const },
      { name: 'content',      type: 'string'  as const },
      { name: 'contentHash',  type: 'bytes32' as const },
    ],
  },
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params;
  const id = parseInt(roundId, 10);

  if (isNaN(id) || id < 1 || id > 140) {
    return NextResponse.json({ error: 'Invalid roundId — must be 1–140' }, { status: 400 });
  }

  try {
    const client = createPublicClient({ transport: http(RPC_URL), chain: base });

    // Step 1: get round from controller
    const round = await client.readContract({
      address: CONTROLLER,
      abi: CONTROLLER_ABI,
      functionName: 'getRound',
      args: [BigInt(id)],
    });

    const oracleInsId = round.oracleInscriptionId;
    if (!oracleInsId || oracleInsId === 0n) {
      return NextResponse.json(
        { error: `Round ${id} not yet posted by oracle.` },
        { status: 404 }
      );
    }

    // Step 2: read question content from proxy
    const [revealed, content] = await client.readContract({
      address: PROXY,
      abi: PROXY_ABI,
      functionName: 'getInscriptionContent',
      args: [oracleInsId],
    });

    if (!revealed) {
      // Oracle inscribed but hasn't revealed yet (should be near-instant after postRound)
      return NextResponse.json(
        {
          roundId: id,
          oracleInscriptionId: oracleInsId.toString(),
          questionUri: round.questionUri,
          revealed: false,
          message: 'Oracle inscription not yet revealed — retry in a few seconds.',
        },
        { status: 202 }
      );
    }

    // Parse question JSON
    let questionData: Record<string, unknown>;
    try {
      questionData = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse question JSON from inscription content.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      roundId: id,
      epochId: round.epochId.toString(),
      oracleInscriptionId: oracleInsId.toString(),
      questionUri: round.questionUri,
      commitOpenAt:  Number(round.commitOpenAt),
      commitCloseAt: Number(round.commitCloseAt),
      revealCloseAt: Number(round.revealCloseAt),
      settled:       round.settled,
      expired:       round.expired,
      revealedAnswer: round.revealedAnswer || null,
      correctCount:  Number(round.correctCount),
      // question fields from oracle inscription
      ...questionData,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
    });

  } catch (err) {
    console.error(`[questions API] Error for round ${id}:`, err);
    return NextResponse.json({ error: 'Failed to read from chain' }, { status: 500 });
  }
}
