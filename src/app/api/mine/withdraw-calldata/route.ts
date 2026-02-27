/**
 * GET /api/mine/withdraw-calldata?wallet=0x...
 *
 * Returns transaction for controller.withdrawStake()
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

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletParam = searchParams.get('wallet');

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }

  const wallet = walletParam as Address;

  try {
    const stake = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'getStake',
      args: [wallet],
    }) as { amount: bigint; withdrawalQueued: boolean; unstakeEpochId: bigint; stakedIndex: bigint };

    const amount = (stake as any).amount ?? (Array.isArray(stake) ? stake[0] : BigInt(0));
    const withdrawalQueued = (stake as any).withdrawalQueued ?? (Array.isArray(stake) ? stake[1] : false);
    const unstakeEpochId = (stake as any).unstakeEpochId ?? (Array.isArray(stake) ? stake[2] : BigInt(0));

    if (!withdrawalQueued) {
      return NextResponse.json({ error: 'withdrawal not queued' }, { status: 403 });
    }
    if (amount === BigInt(0)) {
      return NextResponse.json({ error: 'no stake to withdraw' }, { status: 400 });
    }

    const epoch = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'getEpoch',
      args: [unstakeEpochId],
    }) as any;

    const settled = (epoch as any).settled ?? (Array.isArray(epoch) ? epoch[5] : false);

    if (!settled) {
      return NextResponse.json({ error: 'epoch not settled yet' }, { status: 400 });
    }

    const withdrawData = encodeFunctionData({
      abi: MINE_CONTROLLER_ABI,
      functionName: 'withdrawStake',
      args: [],
    });

    return NextResponse.json({
      wallet,
      unstakeEpochId: BigInt(unstakeEpochId).toString(),
      amount: BigInt(amount).toString(),
      transaction: {
        to: CONTRACTS.MINE_CONTROLLER,
        chainId: CHAIN_ID,
        data: withdrawData,
        value: '0',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
