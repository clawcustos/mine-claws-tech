/**
 * GET /api/mine/claim-calldata?wallet=0x...&epochId=3
 *
 * Returns transaction for controller.claimEpochReward(epochId)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
} from 'viem';
import { CONTRACTS, CHAIN_ID, RPC_URL as DEFAULT_RPC_URL } from '@/lib/constants';
import { MINE_CONTROLLER_ABI } from '@/lib/abis';

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

async function findClaimableEpoch(wallet: Address, startEpoch: bigint, maxLookback = 10): Promise<bigint | null> {
  let i = startEpoch;
  let steps = 0;
  while (i > 0 && steps < maxLookback) {
    const epoch = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getEpoch', args: [i] }) as any;
    const settled = (epoch as any).settled ?? (Array.isArray(epoch) ? epoch[5] : false);
    const claimDeadline = BigInt((epoch as any).claimDeadline ?? (Array.isArray(epoch) ? epoch[6] : 0));
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (settled && (claimDeadline === BigInt(0) || now <= claimDeadline)) {
      const claimed = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'epochClaimed', args: [i, wallet] }) as boolean;
      const credits = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getCredits', args: [wallet, i] }) as bigint;
      if (!claimed && credits > BigInt(0)) {
        return i;
      }
    }
    i = i - BigInt(1);
    steps++;
  }
  return null;
}

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletParam = searchParams.get('wallet');
  const epochIdParam = searchParams.get('epochId');

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }

  const wallet = walletParam as Address;

  try {
    let epochId: bigint;
    if (epochIdParam) {
      epochId = BigInt(epochIdParam);
    } else {
      const currentEpochId = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'currentEpochId', args: [] }) as bigint;
      const found = await findClaimableEpoch(wallet, currentEpochId);
      if (!found) {
        return NextResponse.json({ error: 'no claimable epoch found' }, { status: 404 });
      }
      epochId = found;
    }

    const epoch = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getEpoch', args: [epochId] }) as any;
    const settled = (epoch as any).settled ?? (Array.isArray(epoch) ? epoch[5] : false);
    const claimDeadline = BigInt((epoch as any).claimDeadline ?? (Array.isArray(epoch) ? epoch[6] : 0));
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (!settled) {
      return NextResponse.json({ error: 'epoch not settled yet' }, { status: 400 });
    }
    if (claimDeadline > BigInt(0) && now > claimDeadline) {
      return NextResponse.json({ error: 'claim deadline passed' }, { status: 400 });
    }

    const claimed = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'epochClaimed', args: [epochId, wallet] }) as boolean;
    if (claimed) {
      return NextResponse.json({ error: 'epoch already claimed' }, { status: 400 });
    }

    const credits = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getCredits', args: [wallet, epochId] }) as bigint;
    if (credits === BigInt(0)) {
      return NextResponse.json({ error: 'no credits for this epoch' }, { status: 400 });
    }

    const claimable = await rc({ address: CONTRACTS.MINE_CONTROLLER, abi: MINE_CONTROLLER_ABI, functionName: 'getClaimable', args: [wallet, epochId] }) as bigint;

    if (claimable === BigInt(0)) {
      return NextResponse.json({ error: 'no claimable rewards' }, { status: 400 });
    }

    const claimData = encodeFunctionData({
      abi: MINE_CONTROLLER_ABI,
      functionName: 'claimEpochReward',
      args: [epochId],
    });

    return NextResponse.json({
      wallet,
      epochId: epochId.toString(),
      claimable: claimable.toString(),
      transaction: {
        to: CONTRACTS.MINE_CONTROLLER,
        chainId: CHAIN_ID,
        data: claimData,
        value: '0',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
