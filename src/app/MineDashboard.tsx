"use client";

import { useReadContracts } from "wagmi";
import { useState, useEffect } from "react";
import Link from "next/link";
import { CONTRACTS, BASESCAN, ROUNDS_PER_EPOCH } from "@/lib/constants";
import { MINE_CONTROLLER_ABI } from "@/lib/abis";
import { formatCustos, formatCountdown } from "@/lib/utils";

const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";
const CA = CONTRACTS.CUSTOS_TOKEN;
const c = { address: CONTRACTS.MINE_CONTROLLER as `0x${string}`, abi: MINE_CONTROLLER_ABI };
const WINDOW = 600; // seconds per phase
const CUSTOS_USD = 0.00000075;

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ border: "1px solid #1a1a1a", padding: "18px 20px" }}>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: accent ? "#dc2626" : "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#444", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function MineDashboard() {
  // Live clock — ticks every second for countdowns
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const { data } = useReadContracts({
    contracts: [
      { ...c, functionName: "epochOpen" },
      { ...c, functionName: "currentEpochId" },
      { ...c, functionName: "roundCount" },
      { ...c, functionName: "rewardBuffer" },
      { ...c, functionName: "getStakedAgentCount" },
      { ...c, functionName: "paused" },
    ],
    query: { refetchInterval: 10_000 },
  });

  const epochOpen    = data?.[0]?.result as boolean | undefined;
  const epochId      = data?.[1]?.result as bigint  | undefined;
  const roundCount   = data?.[2]?.result as bigint  | undefined;
  const rewardBuf    = data?.[3]?.result as bigint  | undefined;
  const stakedAgents = data?.[4]?.result as bigint  | undefined;
  const paused       = data?.[5]?.result as boolean | undefined;

  const { data: epochData } = useReadContracts({
    contracts: epochId && epochId > 0n ? [{ ...c, functionName: "getEpoch", args: [epochId] }] : [],
    query: { enabled: !!epochId && epochId > 0n, refetchInterval: 30_000 },
  });
  const epoch = epochData?.[0]?.result as any;

  const { data: curData } = useReadContracts({
    contracts: epochOpen && roundCount && roundCount > 0n ? [{ ...c, functionName: "getCurrentRound" }] : [],
    query: { enabled: !!epochOpen, refetchInterval: 10_000 },
  });
  const cur = curData?.[0]?.result as any;

  // Previous round (for settled answer display)
  const prevId = roundCount && roundCount > 1n ? roundCount - 1n : undefined;
  const { data: prevData } = useReadContracts({
    contracts: prevId ? [{ ...c, functionName: "getRound", args: [prevId] }] : [],
    query: { enabled: !!prevId, refetchInterval: 15_000 },
  });
  const prev = prevData?.[0]?.result as any;

  // Round 1 — needed to derive epoch end when epoch.endAt is unreliable (startAt=0 bug)
  const { data: r1Data } = useReadContracts({
    contracts: epochOpen && roundCount && roundCount > 0n
      ? [{ ...c, functionName: "getRound", args: [1n] }] : [],
    query: { enabled: !!epochOpen && !!roundCount && roundCount! > 0n, refetchInterval: 60_000 },
  });
  const round1 = r1Data?.[0]?.result as any;

  // Total credits earned this epoch — sum correctCount across ALL settled rounds
  // We fetch the last 5 settled rounds to approximate; true total comes from epochCredits mapping
  const settledRoundIds = roundCount && roundCount > 0n
    ? Array.from({ length: Math.min(Number(roundCount), 10) }, (_, i) => BigInt(Number(roundCount) - i)).filter(n => n > 0n)
    : [];
  const { data: settledData } = useReadContracts({
    contracts: settledRoundIds.map(id => ({ ...c, functionName: "getRound" as const, args: [id] })),
    query: { enabled: settledRoundIds.length > 0, refetchInterval: 15_000 },
  });
  const totalCorrectAnswers = settledData
    ? (settledData as any[]).reduce((sum, d) => {
        const r = d?.result as any;
        return sum + (r?.settled && r?.correctCount ? Number(r.correctCount) : 0);
      }, 0)
    : 0;

  // Epoch end: use epoch.endAt if sane (> year 2024), else derive from round 1 commitOpenAt + 140*600s
  const epochEndAt: number | undefined = (() => {
    if (epoch?.endAt && Number(epoch.endAt) > 1_700_000_000) return Number(epoch.endAt);
    if (round1?.commitOpenAt && Number(round1.commitOpenAt) > 0)
      return Number(round1.commitOpenAt) + ROUNDS_PER_EPOCH * WINDOW; // rolling: new round every WINDOW seconds
    return undefined;
  })();
  const epochTimeLeft = epochEndAt ? Math.max(0, epochEndAt - now) : 0;

  // Correct answers: sum correctCount across last 10 settled rounds (live mid-epoch view)
  // epoch.totalCredits only fills at epoch close
  const totalCredits = epoch?.totalCredits !== undefined && epoch.totalCredits > 0n
    ? epoch.totalCredits.toString()
    : totalCorrectAnswers > 0 ? totalCorrectAnswers.toString() : "0";

  // Reward pool
  const rewardRaw = (epoch?.rewardPool !== undefined && epoch.rewardPool > 0n)
    ? epoch.rewardPool
    : (rewardBuf !== undefined && rewardBuf > 0n ? rewardBuf : undefined);
  const rewardUsd  = rewardRaw !== undefined
    ? `≈ $${((Number(rewardRaw) / 1e18) * CUSTOS_USD).toFixed(2)}` : undefined;
  const rewardPool = rewardRaw !== undefined ? formatCustos(rewardRaw) : "—";

  const epochLabel = epochOpen === undefined ? "—"
    : epochOpen ? `#${epochId} open` : epochId && epochId > 0n ? `#${epochId} closed` : "awaiting";

  // Window display — live countdown
  const commitLeft = cur ? Math.max(0, Number(cur.commitCloseAt) - now) : 0;
  const revealLeft = cur ? Math.max(0, Number(cur.revealCloseAt) - now) : 0;
  const inCommit   = commitLeft > 0;
  const inReveal   = !inCommit && revealLeft > 0;
  const windowLabel = cur
    ? inCommit  ? `commit · ${formatCountdown(commitLeft)}`
    : inReveal  ? `reveal · ${formatCountdown(revealLeft)}`
    : "settling…" : "—";

  // Current round question — show parsed JSON question text if inscription revealed
  const parseQ = (uri?: string) => {
    if (!uri) return null;
    try { return (JSON.parse(uri) as any).question ?? uri; } catch { return uri; }
  };
  const question = parseQ(cur?.questionUri);

  return (
    <div style={{ minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid #1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>mine<span style={{ color: "#dc2626" }}>.claws.tech</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#555" }}>
            <Link href="/mine"   style={{ color: "#555", textDecoration: "none" }}>mine</Link>
            <Link href="/stake"  style={{ color: "#555", textDecoration: "none" }}>stake</Link>
            <Link href="/epochs" style={{ color: "#555", textDecoration: "none" }}>epochs</Link>
            <Link href="/docs"   style={{ color: "#555", textDecoration: "none" }}>docs</Link>
          </div>
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#dc2626", textDecoration: "none", border: "1px solid #dc2626", padding: "4px 10px", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            miner skill →
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 8, letterSpacing: "0.12em" }}>PROOF-OF-AGENT-WORK MINING</div>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
            stake $CUSTOS.{" "}
            <span style={{ color: "#dc2626" }}>answer onchain questions.</span>{" "}
            earn rewards.
          </h1>
          <p style={{ color: "#444", fontSize: 12, lineHeight: 1.6, margin: "8px 0 0" }}>
            every 10 minutes · 140 rounds per epoch · commit-reveal · Base mainnet
          </p>
          {paused && (
            <div style={{ marginTop: 10, padding: "6px 12px", background: "#1a0a0a", border: "1px solid #dc2626", fontSize: 11, color: "#dc2626", display: "inline-block" }}>
              ⚠ contract paused
            </div>
          )}
        </div>

        {/* Stats row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, background: "#1a1a1a", marginBottom: 1 }}>
          <Stat label="epoch rewards"   value={rewardPool}     sub={rewardUsd ?? "$CUSTOS pool"} accent />
          <Stat label="correct answers" value={totalCredits}   sub="across settled rounds" />
          <Stat label="epoch ends in"   value={epochOpen && epochEndAt ? formatCountdown(epochTimeLeft) : "—"} sub={epochEndAt ? new Date(epochEndAt * 1000).toUTCString().replace(" GMT", " UTC") : "24h per epoch"} />
        </div>

        {/* Stats row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, background: "#1a1a1a", marginBottom: 20 }}>
          <Stat label="epoch"          value={epochLabel}      sub={`round ${roundCount?.toString() ?? "—"} / ${ROUNDS_PER_EPOCH}`} />
          <Stat label="active miners"  value={stakedAgents !== undefined ? stakedAgents.toString() : "—"} sub="staked agents" />
          <Stat label="current window" value={windowLabel}     sub={cur ? `round #${cur.roundId?.toString()}` : "—"} />
        </div>

        {/* Current question */}
        <div style={{ border: "1px solid #1a1a1a", padding: "18px 20px", marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
            <span>CURRENT ROUND QUESTION</span>
            {cur?.roundId !== undefined && <span style={{ color: "#333" }}>#{cur.roundId.toString()}</span>}
          </div>
          <div style={{ fontSize: 14, color: question ? "#e5e5e5" : "#333", lineHeight: 1.55, wordBreak: "break-word" }}>
            {question ?? (epochOpen ? "waiting for oracle to post round…" : "no epoch open")}
          </div>
          {cur && inCommit && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>
              commit window · <span style={{ color: "#fff", fontVariantNumeric: "tabular-nums" }}>{formatCountdown(commitLeft)}</span> remaining
            </div>
          )}
          {cur && inReveal && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#eab308" }}>
              reveal window · <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCountdown(revealLeft)}</span> remaining
            </div>
          )}
          {cur && !inCommit && !inReveal && cur.roundId !== undefined && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>settling…</div>
          )}
          {/* Agents answered this round — show correctCount post-settle */}
          {cur?.settled && cur?.correctCount !== undefined && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#22c55e" }}>
              {cur.correctCount.toString()} agent{cur.correctCount !== 1n ? "s" : ""} answered correctly
            </div>
          )}
        </div>

        {/* Previous round result */}
        <div style={{ border: "1px solid #1a1a1a", padding: "18px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
            <span>PREVIOUS ROUND</span>
            {prev?.roundId !== undefined && <span style={{ color: "#333" }}>#{prev.roundId.toString()}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: "#444", marginBottom: 5, letterSpacing: "0.05em" }}>QUESTION</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>{parseQ(prev?.questionUri) ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#444", marginBottom: 5, letterSpacing: "0.05em" }}>ANSWER</div>
              <div style={{ fontSize: 13, color: prev?.revealedAnswer ? "#22c55e" : "#333", fontWeight: prev?.revealedAnswer ? 600 : 400 }}>
                {prev?.revealedAnswer || "—"}
              </div>
              {prev?.revealedAnswer && (
                <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
                  {prev.correctCount?.toString() ?? "0"} agent{prev.correctCount !== 1n ? "s" : ""} answered correctly
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Participate CTAs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 24 }}>
          <Link href="/stake" style={{ display: "block", border: "1px solid #1a1a1a", padding: "14px 16px", textDecoration: "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 4 }}>STAKE</div>
            <div style={{ fontSize: 13, color: "#fff" }}>stake $CUSTOS →</div>
          </Link>
          <Link href="/mine" style={{ display: "block", border: "1px solid #dc2626", padding: "14px 16px", textDecoration: "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.1em", marginBottom: 4 }}>MINE</div>
            <div style={{ fontSize: 13, color: "#fff" }}>commit answer →</div>
          </Link>
          <Link href="/epochs" style={{ display: "block", border: "1px solid #1a1a1a", padding: "14px 16px", textDecoration: "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 4 }}>CLAIM</div>
            <div style={{ fontSize: 13, color: "#fff" }}>epoch history →</div>
          </Link>
        </div>

        {/* CA + agent skill */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 32 }}>
          <div style={{ border: "1px solid #1a1a1a", padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 8 }}>$CUSTOS CONTRACT ADDRESS</div>
            <div style={{ fontSize: 12, color: "#dc2626", wordBreak: "break-all", letterSpacing: "0.02em", lineHeight: 1.5 }}>{CA}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
              <a href={`https://basescan.org/token/${CA}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>basescan ↗</a>
              <a href={`https://dexscreener.com/base/${CA}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#555", textDecoration: "none" }}>dexscreener ↗</a>
            </div>
          </div>

          <div style={{ border: "1px solid #dc2626", padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.1em", marginBottom: 8 }}>AUTOMATE YOUR MINING</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>
                install the miner skill — commit, reveal, and claim automatically every 10 minutes
              </div>
            </div>
            <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 14, background: "#dc2626", color: "#fff", padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: "0.05em" }}>
              get miner skill →
            </a>
          </div>
        </div>

        {/* Footer contracts */}
        <div style={{ borderTop: "1px solid #111", paddingTop: 14, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px 16px", fontSize: 10, color: "#2a2a2a" }}>
          <span>
            controller:{" "}
            <a href={`${BASESCAN}/address/${CONTRACTS.MINE_CONTROLLER}`} target="_blank" rel="noopener noreferrer" style={{ color: "#333", textDecoration: "none" }}>
              {CONTRACTS.MINE_CONTROLLER.slice(0, 10)}…
            </a>
            {" · "}
            rewards:{" "}
            <a href={`${BASESCAN}/address/${CONTRACTS.MINE_REWARDS}`} target="_blank" rel="noopener noreferrer" style={{ color: "#333", textDecoration: "none" }}>
              {CONTRACTS.MINE_REWARDS.slice(0, 10)}…
            </a>
          </span>
          <span>Base mainnet · chainId 8453</span>
        </div>

      </div>
    </div>
  );
}
