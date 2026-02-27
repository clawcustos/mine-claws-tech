/**
 * GET /api/mine/unstake-calldata?wallet=0x...&action=cancel
 *
 * Returns transaction for controller.unstake() (queue withdrawal)
 * or controller.cancelUnstake() if action=cancel
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
  const action = searchParams.get('action');

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }

  const wallet = walletParam as Address;

  try {
    const isStaked = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'isStaked',
      args: [wallet],
    }) as boolean;

    if (!isStaked) {
      return NextResponse.json({ error: 'wallet not staked' }, { status: 403 });
    }

    const stake = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'getStake',
      args: [wallet],
    }) as { amount: bigint; withdrawalQueued: boolean; unstakeEpochId: bigint; stakedIndex: bigint };

    const withdrawalQueued = (stake as any).withdrawalQueued ?? (Array.isArray(stake) ? stake[1] : false);

    if (action === 'cancel') {
      if (!withdrawalQueued) {
        return NextResponse.json({ error: 'no queued withdrawal to cancel' }, { status: 400 });
      }

      const cancelData = encodeFunctionData({
        abi: MINE_CONTROLLER_ABI,
        functionName: 'cancelUnstake',
        args: [],
      });

      return NextResponse.json({
        wallet,
        action: 'cancel',
        transaction: {
          to: CONTRACTS.MINE_CONTROLLER,
          chainId: CHAIN_ID,
          data: cancelData,
          value: '0',
        },
      });
    }

    if (withdrawalQueued) {
      return NextResponse.json({ error: 'withdrawal already queued' }, { status: 400 });
    }

    const unstakeData = encodeFunctionData({
      abi: MINE_CONTROLLER_ABI,
      functionName: 'unstake',
      args: [],
    });

    return NextResponse.json({
      wallet,
      transaction: {
        to: CONTRACTS.MINE_CONTROLLER,
        chainId: CHAIN_ID,
        data: unstakeData,
        value: '0',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
