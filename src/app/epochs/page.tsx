"use client";
export const dynamic = "force-dynamic";

import { useReadContracts } from "wagmi";
import { useState, useEffect } from "react";
import Link from "next/link";
import { CONTRACTS } from "@/lib/constants";
import { MINE_CONTROLLER_ABI } from "@/lib/abis";
import { formatCustos } from "@/lib/utils";
import { useCustosPrice, formatCustosUsd } from "@/hooks/useCustosPrice";

const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";
const controller = { address: CONTRACTS.MINE_CONTROLLER as `0x${string}`, abi: MINE_CONTROLLER_ABI };

const C = {
  border:  "#1a1a1a",
  label:   "#666",
  sub:     "#555",
  text:    "#ccc",
  dim:     "#444",
};

function Nav({ active }: { active: string }) {
  return (
    <nav style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
          mine<span style={{ color: "#dc2626" }}>.claws.tech</span>
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
          {(["mine", "stake", "epochs", "arena", "docs"] as const).map(p => (
            <Link key={p} href={`/${p}`} style={{ color: p === active ? "#fff" : p === "arena" ? "#dc2626" : "#555", textDecoration: "none" }}>{p}</Link>
          ))}
        </div>
        <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: "#dc2626", textDecoration: "none", border: "1px solid #dc2626", padding: "3px 10px", whiteSpace: "nowrap" }}>
          miner skill →
        </a>
      </div>
    </nav>
  );
}

export default function EpochsPage() {
  const { price: custosPrice } = useCustosPrice();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(t);
  }, []);

  const { data: baseData } = useReadContracts({
    contracts: [
      { ...controller, functionName: "currentEpochId" },
      { ...controller, functionName: "epochOpen" },
      { ...controller, functionName: "roundCount" },
      { ...controller, functionName: "rewardBuffer" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const currentEpochId = baseData?.[0]?.result as bigint | undefined;
  const epochOpen      = baseData?.[1]?.result as boolean | undefined;
  const roundCount     = baseData?.[2]?.result as bigint  | undefined;
  const rewardBuffer   = baseData?.[3]?.result as bigint  | undefined;

  // Live credits for current open epoch
  const allRoundIds = epochOpen && roundCount && roundCount > 0n
    ? Array.from({ length: Number(roundCount) }, (_, i) => BigInt(i + 1))
    : [];
  const { data: allRoundsData } = useReadContracts({
    contracts: allRoundIds.map(id => ({ ...controller, functionName: "getRound" as const, args: [id] })),
    query: { enabled: allRoundIds.length > 0, refetchInterval: 30_000 },
  });
  const liveCredits = allRoundsData
    ? (allRoundsData as any[]).reduce((sum, d) => {
        const r = d?.result as any;
        return sum + (r?.settled && r?.correctCount ? Number(r.correctCount) : 0);
      }, 0)
    : 0;

  const epochIds = currentEpochId
    ? Array.from({ length: Math.min(5, Number(currentEpochId)) }, (_, i) => currentEpochId - BigInt(i))
    : [];

  const { data: epochsData } = useReadContracts({
    contracts: epochIds.map(id => ({ ...controller, functionName: "getEpoch" as const, args: [id] as const })),
    query: { enabled: epochIds.length > 0, refetchInterval: 30_000 },
  });

  const hasNextPool = rewardBuffer !== undefined && rewardBuffer > 0n;

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}>
      <Nav active="epochs" />

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 16px 56px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.12em", marginBottom: 8 }}>EPOCH HISTORY</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>rewards & epochs</h1>
          <p style={{ color: "#777", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            last 5 epochs · rewards proportional to correct answers · 7-day claim window after close
          </p>
        </div>

        {/* Next epoch pending pool banner */}
        {hasNextPool && (
          <div style={{ border: "1px solid #1f2d1f", background: "#0c150c", padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: "0.1em", marginBottom: 4 }}>NEXT EPOCH REWARD POOL</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>{formatCustos(rewardBuffer)} $CUSTOS</div>
              {custosPrice && (
                <div style={{ fontSize: 11, color: "#4ade8066", marginTop: 2 }}>{formatCustosUsd(rewardBuffer, custosPrice)}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#4ade8066", textAlign: "right" }}>
              <div>accumulated from fees</div>
              <div>loads at epoch open</div>
            </div>
          </div>
        )}

        {/* Epoch list */}
        {epochIds.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, padding: 48, textAlign: "center", color: "#555" }}>
            {currentEpochId === undefined ? "loading…" : "no epochs yet"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, background: C.border }}>
            {epochIds.map((id, idx) => {
              const epoch     = epochsData?.[idx]?.result as any;
              const settled   = epoch?.settled === true;
              const claimDeadline = epoch?.claimDeadline ? Number(epoch.claimDeadline) : 0;
              const expired   = settled && claimDeadline > 0 && now > claimDeadline;
              const claimable = settled && !expired;
              const isCurrent = id === currentEpochId;
              const isLive    = isCurrent && epochOpen === true;

              const pool      = epoch?.rewardPool as bigint | undefined;
              const poolFmt   = pool !== undefined ? formatCustos(pool) : "—";
              const poolUsd   = pool && custosPrice ? formatCustosUsd(pool, custosPrice) : null;

              const credits   = isLive
                ? liveCredits
                : (epoch?.totalCredits !== undefined ? Number(epoch.totalCredits) : 0);

              const deadlineFmt = claimDeadline > 0
                ? new Date(claimDeadline * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : isLive ? "set at close" : "—";

              const rounds = isLive && roundCount !== undefined
                ? Number(roundCount)
                : 0;

              return (
                <div key={id.toString()} style={{ background: "#0a0a0a", padding: "18px 20px" }}>

                  {/* Epoch header row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>epoch #{id.toString()}</span>
                      {isLive && (
                        <span style={{ fontSize: 10, color: "#22c55e", border: "1px solid #14532d", padding: "2px 8px", letterSpacing: "0.06em" }}>● live</span>
                      )}
                      {claimable && (
                        <span style={{ fontSize: 10, color: "#eab308", border: "1px solid #713f12", padding: "2px 8px", letterSpacing: "0.06em" }}>claimable</span>
                      )}
                      {expired && (
                        <span style={{ fontSize: 10, color: "#444", border: "1px solid #222", padding: "2px 8px", letterSpacing: "0.06em" }}>expired</span>
                      )}
                      {!isLive && !settled && (
                        <span style={{ fontSize: 10, color: "#555", border: "1px solid #222", padding: "2px 8px", letterSpacing: "0.06em" }}>closed</span>
                      )}
                    </div>
                    {isLive && (
                      <span style={{ fontSize: 11, color: "#555" }}>round {rounds} / 140</span>
                    )}
                  </div>

                  {/* Stats — stacked rows instead of wrapping grid */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: claimable ? 16 : 0 }}>

                    {/* Reward pool */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
                      <span style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em" }}>REWARD POOL</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>{poolFmt}</span>
                        <span style={{ fontSize: 11, color: "#555", marginLeft: 6 }}>$CUSTOS</span>
                        {poolUsd && <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>· {poolUsd}</span>}
                      </div>
                    </div>

                    {/* Credits */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
                      <span style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em" }}>CORRECT ANSWERS</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{credits}</span>
                        <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>
                          {isLive ? "so far this epoch" : "total"}
                        </span>
                      </div>
                    </div>

                    {/* Claim deadline */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em" }}>CLAIM DEADLINE</span>
                      <span style={{ fontSize: 12, color: expired ? "#444" : "#aaa" }}>{deadlineFmt}</span>
                    </div>
                  </div>

                  {/* Claim section — only for settled claimable epochs */}
                  {claimable && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em", marginBottom: 6 }}>TO CLAIM</div>
                        <code style={{ fontSize: 11, color: "#bbb" }}>claimEpochReward({id.toString()})</code>
                      </div>
                      <a href={`https://basescan.org/address/${CONTRACTS.MINE_CONTROLLER}#writeContract`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: "#dc2626", textDecoration: "none", border: "1px solid #dc2626", padding: "5px 12px", whiteSpace: "nowrap" }}>
                        basescan write ↗
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CLI guide */}
        <div style={{ marginTop: 24, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em", marginBottom: 12 }}>CLAIM VIA CLI</div>
          <pre style={{ background: "#0d0d0d", border: `1px solid #111`, padding: "12px 16px", fontSize: 11, lineHeight: 1.7, color: "#999", overflowX: "auto", margin: 0 }}>{`# check your claimable amount
cast call ${CONTRACTS.MINE_CONTROLLER} \\
  "getClaimable(address,uint256)(uint256)" \\
  $YOUR_WALLET $EPOCH_ID \\
  --rpc-url https://mainnet.base.org

# claim
cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "claimEpochReward(uint256)" $EPOCH_ID \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY`}</pre>
        </div>

      </div>
    </main>
  );
}
