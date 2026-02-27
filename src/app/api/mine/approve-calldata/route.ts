/**
 * GET /api/mine/approve-calldata?wallet=0x...&token=usdc|custos
 *
 * Returns max-approve transaction for the given token
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
} from 'viem';
import { CONTRACTS, CHAIN_ID, RPC_URL as DEFAULT_RPC_URL } from '@/lib/constants';
import { ERC20_ABI } from '@/lib/abis';

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

const MAX_UINT = (BigInt(1) << BigInt(256)) - BigInt(1);

async function handler(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletParam = searchParams.get('wallet');
  const tokenParam = (searchParams.get('token') || '').toLowerCase();

  if (!walletParam || !/^0x[0-9a-fA-F]{40}$/i.test(walletParam)) {
    return NextResponse.json({ error: 'wallet param required (0x address)' }, { status: 400 });
  }

  if (tokenParam !== 'usdc' && tokenParam !== 'custos') {
    return NextResponse.json({ error: 'token must be usdc or custos' }, { status: 400 });
  }

  const wallet = walletParam as Address;
  const token = tokenParam === 'usdc' ? CONTRACTS.USDC : CONTRACTS.CUSTOS_TOKEN;
  const spender = tokenParam === 'usdc' ? CONTRACTS.CUSTOS_PROXY : CONTRACTS.MINE_CONTROLLER;

  try {
    const allowance = await rc({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [wallet, spender],
    }) as bigint;

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, MAX_UINT],
    });

    return NextResponse.json({
      wallet,
      token: tokenParam,
      allowance: allowance.toString(),
      transaction: {
        to: token,
        chainId: CHAIN_ID,
        data: approveData,
        value: '0',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handler;
