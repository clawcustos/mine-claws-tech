/**
 * GET /api/mine/status?wallet=0x...
 *
 * Returns agent status: stake position, tier, current round/epoch info,
 * claimable rewards (recent epochs), allowances, balances.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  type Address,
} from 'viem';
import { CONTRACTS, CHAIN_ID, RPC_URL as DEFAULT_RPC_URL } from '@/lib/constants';
import { MINE_CONTROLLER_ABI, ERC20_ABI } from '@/lib/abis';

export const dynamic = 'force-dynamic';

const RPC_URL = process.env.BASE_RPC_URL || DEFAULT_RPC_URL;

const baseChain = {
  id: CHAIN_ID,
  name: 'base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const client = createPublicClient({ transport: http(RPC_URL), chain: baseChain });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rc = client.readContract.bind(client) as (args: any) => Promise<any>;

const MIN_STAKE = BigInt('25000000') * BigInt(10) ** BigInt(18);

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletParam = searchParams.get('wallet');

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }

  const wallet = walletParam as Address;

  try {
    const [stake, isStaked, round, currentEpochId, epochOpen] = await Promise.all([
      rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getStake', args: [wallet] }),
      rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'isStaked', args: [wallet] }),
      rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getCurrentRound', args: [] }),
      rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'currentEpochId', args: [] }),
      rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'epochOpen', args: [] }),
    ]) as any;

    const stakeAmount = (stake as any).amount ?? (Array.isArray(stake) ? stake[0] : BigInt(0));
    const withdrawalQueued = (stake as any).withdrawalQueued ?? (Array.isArray(stake) ? stake[1] : false);
    const unstakeEpochId = (stake as any).unstakeEpochId ?? (Array.isArray(stake) ? stake[2] : BigInt(0));
    const stakedIndex = (stake as any).stakedIndex ?? (Array.isArray(stake) ? stake[3] : BigInt(0));

    const tier = stakeAmount >= MIN_STAKE ? 1 : 0;

    const [custosBalance, usdcAllowance, custosAllowance] = await Promise.all([
      rc({ address: CONTRACTS.CUSTOS_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] }),
      rc({ address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: 'allowance', args: [wallet, CONTRACTS.CUSTOS_PROXY] }),
      rc({ address: CONTRACTS.CUSTOS_TOKEN, abi: ERC20_ABI, functionName: 'allowance', args: [wallet, CONTRACTS.MINE_CONTROLLER] }),
    ]) as bigint[];

    const epochInfo = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'getEpoch',
      args: [currentEpochId as bigint],
    }) as any;

    const claimables: Array<Record<string, string | boolean>> = [];
    const maxLookback = 5;
    let i = BigInt(currentEpochId as bigint);
    let steps = 0;
    while (i > 0 && steps < maxLookback) {
      const [epoch, claimed, credits, claimable] = await Promise.all([
        rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getEpoch', args: [i] }),
        rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'epochClaimed', args: [i, wallet] }),
        rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getCredits', args: [wallet, i] }),
        rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getClaimable', args: [wallet, i] }),
      ]) as any;

      const settled = (epoch as any).settled ?? (Array.isArray(epoch) ? epoch[5] : false);
      const claimDeadline = BigInt((epoch as any).claimDeadline ?? (Array.isArray(epoch) ? epoch[6] : 0));

      claimables.push({
        epochId: i.toString(),
        settled: Boolean(settled),
        claimDeadline: claimDeadline.toString(),
        claimed: Boolean(claimed),
        credits: BigInt(credits).toString(),
        claimable: BigInt(claimable).toString(),
      });

      i = i - BigInt(1);
      steps++;
    }

    return NextResponse.json({
      wallet,
      chainId: CHAIN_ID,
      stake: {
        amount: BigInt(stakeAmount).toString(),
        withdrawalQueued,
        unstakeEpochId: BigInt(unstakeEpochId).toString(),
        stakedIndex: BigInt(stakedIndex).toString(),
        isStaked: Boolean(isStaked),
      },
      tier,
      round: {
        roundId: (round as any).roundId?.toString?.() ?? (Array.isArray(round) ? round[0].toString() : '0'),
        epochId: (round as any).epochId?.toString?.() ?? (Array.isArray(round) ? round[1].toString() : '0'),
        commitOpenAt: (round as any).commitOpenAt?.toString?.() ?? (Array.isArray(round) ? round[2].toString() : '0'),
        commitCloseAt: (round as any).commitCloseAt?.toString?.() ?? (Array.isArray(round) ? round[3].toString() : '0'),
        revealCloseAt: (round as any).revealCloseAt?.toString?.() ?? (Array.isArray(round) ? round[4].toString() : '0'),
        settled: (round as any).settled ?? (Array.isArray(round) ? round[8] : false),
        expired: (round as any).expired ?? (Array.isArray(round) ? round[9] : false),
      },
      epoch: {
        epochId: (epochInfo as any).epochId?.toString?.() ?? (Array.isArray(epochInfo) ? epochInfo[0].toString() : '0'),
        settled: (epochInfo as any).settled ?? (Array.isArray(epochInfo) ? epochInfo[5] : false),
        claimDeadline: (epochInfo as any).claimDeadline?.toString?.() ?? (Array.isArray(epochInfo) ? epochInfo[6].toString() : '0'),
        open: Boolean(epochOpen),
      },
      claimables,
      allowances: {
        usdcOnProxy: BigInt(usdcAllowance).toString(),
        custosOnController: BigInt(custosAllowance).toString(),
      },
      balances: {
        custos: BigInt(custosBalance).toString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
