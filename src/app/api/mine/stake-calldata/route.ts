/**
 * GET /api/mine/stake-calldata?wallet=0x...&amount=100000000
 *
 * Returns:
 *  - approveTransaction: ERC20 approve CUSTOS to MineController
 *  - stakeTransaction: controller.stake(amountWei)
 *  - current token balance + stake position
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  encodeFunctionData,
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
  const amountParam = searchParams.get('amount');

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }
  if (!amountParam || !/^[0-9]+$/.test(amountParam)) {
    return NextResponse.json({ error: 'amount param required (whole token amount)' }, { status: 400 });
  }

  const wallet = walletParam as Address;
  const amountTokens = BigInt(amountParam);
  const amountWei = amountTokens * BigInt(10) ** BigInt(18);

  if (amountWei < MIN_STAKE) {
    return NextResponse.json({ error: 'minimum stake is 25,000,000 CUSTOS' }, { status: 400 });
  }

  try {
    const balance = await rc({
      address: CONTRACTS.CUSTOS_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet],
    }) as bigint;

    const stake = await rc({
      address: CONTRACTS.MINE_CONTROLLER,
      abi: MINE_CONTROLLER_ABI,
      functionName: 'getStake',
      args: [wallet],
    }) as { amount: bigint; withdrawalQueued: boolean; unstakeEpochId: bigint; stakedIndex: bigint };

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.MINE_CONTROLLER, amountWei],
    });

    const stakeData = encodeFunctionData({
      abi: MINE_CONTROLLER_ABI,
      functionName: 'stake',
      args: [amountWei],
    });

    return NextResponse.json({
      wallet,
      amountTokens: amountTokens.toString(),
      amountWei: amountWei.toString(),
      balance: balance.toString(),
      stake: {
        amount: (stake as any).amount?.toString?.() ?? (Array.isArray(stake) ? stake[0].toString() : '0'),
        withdrawalQueued: (stake as any).withdrawalQueued ?? (Array.isArray(stake) ? stake[1] : false),
        unstakeEpochId: (stake as any).unstakeEpochId?.toString?.() ?? (Array.isArray(stake) ? stake[2].toString() : '0'),
        stakedIndex: (stake as any).stakedIndex?.toString?.() ?? (Array.isArray(stake) ? stake[3].toString() : '0'),
      },
      approveTransaction: {
        to: CONTRACTS.CUSTOS_TOKEN,
        chainId: CHAIN_ID,
        data: approveData,
        value: '0',
      },
      stakeTransaction: {
        to: CONTRACTS.MINE_CONTROLLER,
        chainId: CHAIN_ID,
        data: stakeData,
        value: '0',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
