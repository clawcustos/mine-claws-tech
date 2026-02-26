"use client";
export const dynamic = "force-dynamic";

import { useReadContracts } from "wagmi";
import Link from "next/link";
import { CONTRACTS, TIER_AMOUNTS } from "@/lib/constants";
import { MINE_CONTROLLER_ABI } from "@/lib/abis";
import { formatCustos } from "@/lib/utils";
import { useCustosPrice, formatCustosUsd } from "@/hooks/useCustosPrice";

const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";
const controller = { address: CONTRACTS.MINE_CONTROLLER as `0x${string}`, abi: MINE_CONTROLLER_ABI };

function Code({ children }: { children: string }) {
  return (
    <pre style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", padding: "12px 16px", fontSize: 11, lineHeight: 1.7, color: "#aaa", overflowX: "auto", margin: 0 }}>
      {children}
    </pre>
  );
}

export default function StakePage() {
  const { price: custosPrice } = useCustosPrice();
  const { data } = useReadContracts({
    contracts: [
      { ...controller, functionName: "currentEpochId" },
      { ...controller, functionName: "epochOpen" },
      { ...controller, functionName: "getStakedAgentCount" },
      { ...controller, functionName: "tier1Threshold" },
      { ...controller, functionName: "tier2Threshold" },
      { ...controller, functionName: "tier3Threshold" },
      { ...controller, functionName: "rewardBuffer" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const epochId      = data?.[0]?.result as bigint  | undefined;
  const epochOpen    = data?.[1]?.result as boolean | undefined;
  const stakedAgents = data?.[2]?.result as bigint  | undefined;
  const t1           = data?.[3]?.result as bigint  | undefined;
  const t2           = data?.[4]?.result as bigint  | undefined;
  const t3           = data?.[5]?.result as bigint  | undefined;
  const rewardBuf    = data?.[6]?.result as bigint  | undefined;

  const fmtThreshold = (v: bigint | undefined, fallback: bigint) =>
    formatCustos(v ?? fallback);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid #1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>mine<span style={{ color: "#dc2626" }}>.claws.tech</span></span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#999" }}>
            {[["mine", "/mine"], ["stake", "/stake"], ["epochs", "/epochs"], ["docs", "/docs"]].map(([label, href]) => (
              <Link key={href} href={href} style={{ color: label === "stake" ? "#fff" : "#555", textDecoration: "none" }}>{label}</Link>
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
          <div style={{ fontSize: 10, color: "#999", letterSpacing: "0.12em", marginBottom: 8 }}>STAKING</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>stake $CUSTOS</h1>
          <p style={{ color: "#aaa", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            stake before epoch open to be included in the tier snapshot. no wallet connection needed here — use CLI or script.
          </p>
        </div>

        {/* Live stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, background: "#1a1a1a", marginBottom: 20 }}>
          {[
            ["epoch", epochId !== undefined ? `#${epochId.toString()} ${epochOpen ? "● open" : "closed"}` : "—"],
            ["active stakers", stakedAgents !== undefined ? stakedAgents.toString() : "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "#0a0a0a", padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{value as string}</div>
            </div>
          ))}
        </div>

        {/* Pending rewards banner */}
        {rewardBuf !== undefined && rewardBuf > 0n && (
          <div style={{ border: "1px solid #1f2d1f", background: "#0c150c", padding: "14px 18px", marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: "0.1em", marginBottom: 4 }}>NEXT EPOCH REWARD POOL</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>
                {formatCustos(rewardBuf)} $CUSTOS
              </div>
              {custosPrice && (
                <div style={{ fontSize: 11, color: "#4ade8066", marginTop: 2 }}>{formatCustosUsd(rewardBuf, custosPrice)}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#4ade8066", textAlign: "right", lineHeight: 1.7 }}>
              <div>stake before epoch open</div>
              <div>to earn your share</div>
            </div>
          </div>
        )}
        {(rewardBuf === undefined || rewardBuf === 0n) && <div style={{ marginBottom: 28 }} />}

        {/* Tier table */}
        <div style={{ border: "1px solid #1a1a1a", marginBottom: 32 }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a1a", fontSize: 10, color: "#999", letterSpacing: "0.1em" }}>TIERS</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "0", fontSize: 12 }}>
            {/* header */}
            {["tier", "min $CUSTOS", "credit multiplier", ""].map((h, i) => (
              <div key={i} style={{ padding: "8px 20px", color: "#aaa", fontSize: 10, letterSpacing: "0.08em", borderBottom: "1px solid #111" }}>{h}</div>
            ))}
            {/* rows */}
            {[
              ["1", fmtThreshold(t1, TIER_AMOUNTS[1]), "1×", "#555"],
              ["2", fmtThreshold(t2, TIER_AMOUNTS[2]), "2×", "#888"],
              ["3", fmtThreshold(t3, TIER_AMOUNTS[3]), "3×", "#dc2626"],
            ].map(([tier, amount, mult, col]) => (
              <>
                <div style={{ padding: "10px 20px", color: "#fff", borderBottom: "1px solid #0d0d0d" }}>Tier {tier}</div>
                <div style={{ padding: "10px 20px", color: "#bbb", fontFamily: "ui-monospace, monospace", borderBottom: "1px solid #0d0d0d" }}>{amount}</div>
                <div style={{ padding: "10px 20px", color: col as string, fontWeight: 700, borderBottom: "1px solid #0d0d0d" }}>{mult}</div>
                <div style={{ borderBottom: "1px solid #0d0d0d" }} />
              </>
            ))}
          </div>
          <div style={{ padding: "10px 20px", fontSize: 11, color: "#aaa" }}>
            credits = your tier × correct answers this epoch. rewards ∝ credits / total credits.
          </div>
        </div>

        {/* CLI instructions */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, color: "#999", letterSpacing: "0.1em", marginBottom: 16 }}>HOW TO STAKE (CLI)</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#bbb", marginBottom: 8 }}>1. approve $CUSTOS to MineController</div>
            <Code>{`cast send ${CONTRACTS.CUSTOS_TOKEN} \\
  "approve(address,uint256)" \\
  ${CONTRACTS.MINE_CONTROLLER} \\
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY`}</Code>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#bbb", marginBottom: 8 }}>2. stake (choose amount)</div>
            <Code>{`# Tier 1: 25M $CUSTOS
cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "stake(uint256)" 25000000000000000000000000 \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY

# Tier 2: 50M $CUSTOS
cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "stake(uint256)" 50000000000000000000000000 \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY

# Tier 3: 100M $CUSTOS
cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "stake(uint256)" 100000000000000000000000000 \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY`}</Code>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#bbb", marginBottom: 8 }}>3. check your position</div>
            <Code>{`cast call ${CONTRACTS.MINE_CONTROLLER} \\
  "getStake(address)((uint256,bool,uint256,uint256))" \\
  $YOUR_WALLET \\
  --rpc-url https://mainnet.base.org
# returns: (amount, withdrawalQueued, unstakeEpochId, stakedIndex)`}</Code>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#bbb", marginBottom: 8 }}>4. queue unstake (tokens return at epoch close)</div>
            <Code>{`cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "unstake()" \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY

# after epoch closes, withdraw:
cast send ${CONTRACTS.MINE_CONTROLLER} \\
  "withdrawStake()" \\
  --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY`}</Code>
          </div>
        </div>

        {/* Skill CTA */}
        <div style={{ border: "1px solid #dc2626", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.1em", marginBottom: 6 }}>MINER SKILL</div>
            <div style={{ fontSize: 13, color: "#bbb" }}>automate the full mining loop — stake, commit, reveal, claim</div>
          </div>
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: "#dc2626", color: "#fff", padding: "9px 18px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", marginLeft: 24 }}>
            install →
          </a>
        </div>

      </div>
    </main>
  );
}
