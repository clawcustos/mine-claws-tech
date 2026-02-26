"use client";

import { useState, useEffect } from "react";

const DEXSCREENER_URL =
  "https://api.dexscreener.com/latest/dex/tokens/0xF3e20293514d775a3149C304820d9E6a6FA29b07";

const FALLBACK_PRICE = 0.00000075; // fallback if API fails
const CACHE_TTL = 60_000; // 1 min

let _cache: { price: number; ts: number } | null = null;

export function useCustosPrice(): { price: number | null; loading: boolean } {
  const [price, setPrice] = useState<number | null>(_cache?.price ?? null);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let cancelled = false;

    async function fetch_() {
      // Use cache if fresh
      if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
        setPrice(_cache.price);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(DEXSCREENER_URL);
        const data = await res.json();
        // DexScreener returns pairs array — pick highest liquidity Base pair
        const pairs: any[] = data?.pairs ?? [];
        const basePairs = pairs.filter((p: any) => p.chainId === "base");
        if (basePairs.length > 0) {
          // Sort by liquidity descending
          basePairs.sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
          const p = parseFloat(basePairs[0].priceUsd);
          if (!isNaN(p) && p > 0) {
            _cache = { price: p, ts: Date.now() };
            if (!cancelled) { setPrice(p); setLoading(false); }
            return;
          }
        }
        throw new Error("no valid price");
      } catch {
        _cache = { price: FALLBACK_PRICE, ts: Date.now() };
        if (!cancelled) { setPrice(FALLBACK_PRICE); setLoading(false); }
      }
    }

    fetch_();
    const interval = setInterval(fetch_, CACHE_TTL);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { price, loading };
}

/** Format a raw $CUSTOS bigint amount as a USD string, e.g. "$12,345" */
export function formatCustosUsd(rawCustos: bigint | undefined, priceUsd: number | null): string {
  if (rawCustos === undefined || rawCustos === null || priceUsd === null) return "";
  const custos = Number(rawCustos) / 1e18;
  const usd = custos * priceUsd;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)     return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (usd >= 1)         return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
