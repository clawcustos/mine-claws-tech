"use client";
export const dynamic = "force-dynamic";

import { useReadContracts } from "wagmi";
import Link from "next/link";
import { CONTRACTS } from "@/lib/constants";
import { MINE_CONTROLLER_ABI } from "@/lib/abis";
import { formatCustos } from "@/lib/utils";

const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";
const controller = { address: CONTRACTS.MINE_CONTROLLER as `0x${string}`, abi: MINE_CONTROLLER_ABI };

export default function EpochsPage() {
  const { data: baseData } = useReadContracts({
    contracts: [
      { ...controller, functionName: "currentEpochId" },
      { ...controller, functionName: "epochOpen" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const currentEpochId = baseData?.[0]?.result as bigint | undefined;
  const epochOpen      = baseData?.[1]?.result as boolean | undefined;

  const epochIds = currentEpochId
    ? Array.from({ length: Math.min(5, Number(currentEpochId)) }, (_, i) => currentEpochId - BigInt(i))
    : [];

  const { data: epochsData } = useReadContracts({
    contracts: epochIds.map(id => ({ ...controller, functionName: "getEpoch" as const, args: [id] as const })),
    query: { enabled: epochIds.length > 0, refetchInterval: 30_000 },
  });

  const now = Math.floor(Date.now() / 1000);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}>

      <nav style={{ borderBottom: "1px solid #1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>mine<span style={{ color: "#dc2626" }}>.claws.tech</span></span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#999" }}>
            {[["mine", "/mine"], ["stake", "/stake"], ["epochs", "/epochs"], ["docs", "/docs"]].map(([label, href]) => (
              <Link key={href} href={href} style={{ color: label === "epochs" ? "#fff" : "#555", textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#dc2626", textDecoration: "none", border: "1px solid #dc2626", padding: "4px 10px", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            miner skill →
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px" }}>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: "#999", letterSpacing: "0.12em", marginBottom: 8 }}>HISTORY</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>epoch history</h1>
          <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>
            last 5 epochs · claim rewards via CLI using <code style={{ color: "#dc2626" }}>claimEpochReward(epochId)</code>
          </p>
        </div>

        {epochIds.length === 0 ? (
          <div style={{ border: "1px solid #1a1a1a", padding: 48, textAlign: "center", color: "#999" }}>
            {currentEpochId === undefined ? "loading…" : "no epochs yet"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {epochIds.map((id, idx) => {
              const epoch = epochsData?.[idx]?.result as any;
              const settled    = epoch?.settled === true;
              const expired    = epoch ? now > Number(epoch.claimDeadline) : false;
              const isCurrent  = id === currentEpochId;

              return (
                <div key={id.toString()} style={{ border: "1px solid #1a1a1a", padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>epoch #{id.toString()}</span>
                        {isCurrent && epochOpen && (
                          <span style={{ fontSize: 10, color: "#22c55e", border: "1px solid #14532d", padding: "2px 8px" }}>● live</span>
                        )}
                        {settled && !expired && (
                          <span style={{ fontSize: 10, color: "#eab308", border: "1px solid #713f12", padding: "2px 8px" }}>settled</span>
                        )}
                        {expired && (
                          <span style={{ fontSize: 10, color: "#999", border: "1px solid #1a1a1a", padding: "2px 8px" }}>expired</span>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 32px", fontSize: 12 }}>
                        <div>
                          <div style={{ color: "#999", marginBottom: 2, fontSize: 10 }}>REWARD POOL</div>
                          <div style={{ color: "#dc2626", fontWeight: 700 }}>{epoch ? formatCustos(epoch.rewardPool) : "—"}</div>
                          <div style={{ color: "#aaa", fontSize: 10 }}>$CUSTOS</div>
                        </div>
                        <div>
                          <div style={{ color: "#999", marginBottom: 2, fontSize: 10 }}>TOTAL CREDITS</div>
                          <div>{epoch?.totalCredits?.toString() ?? "—"}</div>
                          <div style={{ color: "#aaa", fontSize: 10 }}>correct reveals</div>
                        </div>
                        <div>
                          <div style={{ color: "#999", marginBottom: 2, fontSize: 10 }}>CLAIM DEADLINE</div>
                          <div style={{ fontSize: 11 }}>
                            {epoch?.claimDeadline ? new Date(Number(epoch.claimDeadline) * 1000).toLocaleDateString() : "—"}
                          </div>
                          <div style={{ color: "#aaa", fontSize: 10 }}>30 days after close</div>
                        </div>
                      </div>
                    </div>

                    {/* Right side — claim instructions */}
                    {settled && !expired && (
                      <div style={{ textAlign: "right", marginLeft: 24, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: "#999", marginBottom: 6 }}>TO CLAIM</div>
                        <code style={{ fontSize: 11, color: "#bbb", display: "block", lineHeight: 1.5 }}>
                          claimEpochReward({id.toString()})
                        </code>
                        <a href={`https://basescan.org/address/${CONTRACTS.MINE_CONTROLLER}#writeContract`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 10, color: "#dc2626", textDecoration: "none", marginTop: 4, display: "inline-block" }}>
                          basescan write ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CLI claim guide */}
        <div style={{ marginTop: 32, border: "1px solid #1a1a1a", padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "#999", letterSpacing: "0.1em", marginBottom: 12 }}>CLAIM VIA CLI</div>
          <pre style={{ background: "#0d0d0d", border: "1px solid #111", padding: "12px 16px", fontSize: 11, lineHeight: 1.7, color: "#aaa", overflowX: "auto", margin: 0 }}>{`# check claimable for your wallet + epoch
cast call ${CONTRACTS.MINE_CONTROLLER} \\
  "getClaimable(address,uint256)(uint256)" \\
  $YOUR_WALLET $EPOCH_ID \\
  --rpc-url https://mainnet.base.org

# claim
cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "claimEpochReward(uint256)" \\
  $EPOCH_ID \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY`}</pre>
        </div>

      </div>
    </main>
  );
}
