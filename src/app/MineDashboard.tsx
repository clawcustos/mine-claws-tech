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

// Colour palette — readable on #0a0a0a background
const C = {
  label:    "#999",   // section eyebrows, stat labels
  sub:      "#777",   // stat sub-text
  nav:      "#999",   // nav links
  text:     "#ccc",   // body / question text
  dim:      "#888",   // secondary / expired
  tableHdr: "#666",   // table column headers
  border:   "#1a1a1a",
  footer:   "#555",
};

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, color: C.label, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: accent ? "#dc2626" : "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Single flight row: one of latest, N-1, N-2
function FlightRow({
  label, phase, roundId, countdown, countdownColor, question, answer, correctCount, settled, expired, awaitingOracle,
}: {
  label: string; phase: string; roundId?: string; countdown?: number; countdownColor: string;
  question?: string | null; answer?: string; correctCount?: number; settled?: boolean; expired?: boolean; awaitingOracle?: boolean;
}) {
  const phaseColor = phase === "commit" ? "#fff"
    : phase === "reveal"   ? "#eab308"
    : phase === "settled"  ? "#22c55e"
    : C.dim;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 88px 1fr auto", gap: 12, alignItems: "start", padding: "12px 0", borderBottom: `1px solid #111` }}>
      <div>
        <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: C.sub }}>{roundId ? `#${roundId}` : "—"}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: phaseColor, fontWeight: 600, letterSpacing: "0.06em" }}>{phase.toUpperCase()}</div>
        {countdown !== undefined && countdown > 0 && (
          <div style={{ fontSize: 11, color: countdownColor, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
            {formatCountdown(countdown)}
          </div>
        )}
        {awaitingOracle && <div style={{ fontSize: 9, color: C.dim, marginTop: 3 }}>awaiting oracle</div>}
        {settled && <div style={{ fontSize: 10, color: "#22c55e", marginTop: 2 }}>✓</div>}
        {expired && !settled && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>expired</div>}
      </div>
      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.45, wordBreak: "break-word" }}>
        {question ?? "—"}
      </div>
      <div style={{ textAlign: "right", minWidth: 56 }}>
        {answer && (
          <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, wordBreak: "break-all", maxWidth: 90, marginLeft: "auto" }}
               title={answer}>
            {answer.length > 20 ? answer.slice(0, 10) + "…" + answer.slice(-8) : answer}
          </div>
        )}
        {settled && correctCount !== undefined && (
          <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{correctCount} correct</div>
        )}
        {awaitingOracle && <div style={{ fontSize: 9, color: C.dim }}>~next tick</div>}
      </div>
    </div>
  );
}

export function MineDashboard() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Core epoch/round state — poll every 10s (lightweight: 6 scalar reads)
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
    query: { enabled: !!epochId && epochId > 0n, refetchInterval: 60_000 },
  });
  const epoch = epochData?.[0]?.result as any;

  // ── 3-flight rounds ──────────────────────────────────────────────────────────
  const rN  = roundCount && roundCount > 0n ? roundCount      : undefined;
  const rN1 = roundCount && roundCount > 1n ? roundCount - 1n : undefined;
  const rN2 = roundCount && roundCount > 2n ? roundCount - 2n : undefined;

  const flight3Contracts = [
    ...(rN  ? [{ ...c, functionName: "getRound" as const, args: [rN]  }] : []),
    ...(rN1 ? [{ ...c, functionName: "getRound" as const, args: [rN1] }] : []),
    ...(rN2 ? [{ ...c, functionName: "getRound" as const, args: [rN2] }] : []),
  ];
  // Poll flight rounds every 30s — live countdowns are derived from timestamps client-side
  const { data: flightData } = useReadContracts({
    contracts: flight3Contracts,
    query: { enabled: flight3Contracts.length > 0 && !!epochOpen, refetchInterval: 30_000 },
  });

  let idx = 0;
  const roundN  = rN  ? (flightData?.[idx++]?.result as any) : undefined;
  const roundN1 = rN1 ? (flightData?.[idx++]?.result as any) : undefined;
  const roundN2 = rN2 ? (flightData?.[idx++]?.result as any) : undefined;

  // Round 1 for epoch-end derivation — only needs to load once
  const { data: r1Data } = useReadContracts({
    contracts: epochOpen && roundCount && roundCount > 0n
      ? [{ ...c, functionName: "getRound", args: [1n] }] : [],
    query: { enabled: !!epochOpen && !!roundCount && roundCount! > 0n, refetchInterval: 0 },
  });
  const round1 = r1Data?.[0]?.result as any;

  // Total credits — all rounds 1..N, refetch only when roundCount changes (a new round means prev settled)
  const allRoundIds = roundCount && roundCount > 0n
    ? Array.from({ length: Number(roundCount) }, (_, i) => BigInt(i + 1))
    : [];
  const { data: allRoundsData } = useReadContracts({
    contracts: allRoundIds.map(id => ({ ...c, functionName: "getRound" as const, args: [id] })),
    // No timed refetchInterval — wagmi will re-run when roundCount changes (deps change = new query key)
    query: { enabled: allRoundIds.length > 0 && !!epochOpen },
  });
  const totalCorrectAnswers = allRoundsData
    ? (allRoundsData as any[]).reduce((sum, d) => {
        const r = d?.result as any;
        return sum + (r?.settled && r?.correctCount ? Number(r.correctCount) : 0);
      }, 0)
    : 0;

  // Epoch end
  const epochEndAt: number | undefined = (() => {
    if (epoch?.endAt && Number(epoch.endAt) > 1_700_000_000) return Number(epoch.endAt);
    if (round1?.commitOpenAt && Number(round1.commitOpenAt) > 0)
      return Number(round1.commitOpenAt) + ROUNDS_PER_EPOCH * WINDOW;
    return undefined;
  })();
  const epochTimeLeft = epochEndAt ? Math.max(0, epochEndAt - now) : 0;

  const totalCredits = epoch?.totalCredits !== undefined && epoch.totalCredits > 0n
    ? epoch.totalCredits.toString()
    : totalCorrectAnswers > 0 ? totalCorrectAnswers.toString() : "0";

  const rewardRaw = (epoch?.rewardPool !== undefined && epoch.rewardPool > 0n)
    ? epoch.rewardPool
    : (rewardBuf !== undefined && rewardBuf > 0n ? rewardBuf : undefined);
  const rewardUsd  = rewardRaw !== undefined
    ? `≈ $${((Number(rewardRaw) / 1e18) * CUSTOS_USD).toFixed(2)}` : undefined;
  const rewardPool = rewardRaw !== undefined ? formatCustos(rewardRaw) : "—";

  const epochLabel = epochOpen === undefined ? "—"
    : epochOpen ? `#${epochId} open` : epochId && epochId > 0n ? `#${epochId} closed` : "awaiting";

  function getPhase(r: any): { phase: string; countdown?: number; countdownColor: string; awaitingOracle?: boolean } {
    if (!r || r.roundId === 0n) return { phase: "—", countdownColor: C.dim };
    const commitLeft = Math.max(0, Number(r.commitCloseAt) - now);
    const revealLeft = Math.max(0, Number(r.revealCloseAt) - now);
    if (r.settled) return { phase: "settled", countdownColor: "#22c55e" };
    if (r.expired) return { phase: "expired", countdownColor: C.dim };
    if (commitLeft > 0) return { phase: "commit", countdown: commitLeft, countdownColor: "#fff" };
    if (revealLeft > 0) return { phase: "reveal", countdown: revealLeft, countdownColor: "#eab308" };
    // reveal window closed, not settled yet — oracle settles at next 10-min tick
    return { phase: "settling", countdownColor: C.dim, awaitingOracle: true };
  }

  const phaseN  = getPhase(roundN);
  const phaseN1 = getPhase(roundN1);
  const phaseN2 = getPhase(roundN2);

  // For settling rows, pass awaitingOracle flag to show helpful sub-text
  const awaitingN  = phaseN.awaitingOracle;
  const awaitingN1 = phaseN1.awaitingOracle;
  const awaitingN2 = phaseN2.awaitingOracle;

  const [qN,  setQN]  = useState<string | null>(null);
  const [qN1, setQN1] = useState<string | null>(null);
  const [qN2, setQN2] = useState<string | null>(null);

  useEffect(() => {
    if (!roundN?.roundId) return;
    fetch(`/api/questions/${roundN.roundId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setQN(d?.question ?? roundN.questionUri ?? null))
      .catch(() => setQN(roundN.questionUri ?? null));
  }, [roundN?.roundId?.toString()]);

  useEffect(() => {
    if (!roundN1?.roundId) return;
    fetch(`/api/questions/${roundN1.roundId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setQN1(d?.question ?? roundN1.questionUri ?? null))
      .catch(() => setQN1(roundN1.questionUri ?? null));
  }, [roundN1?.roundId?.toString()]);

  useEffect(() => {
    if (!roundN2?.roundId) return;
    fetch(`/api/questions/${roundN2.roundId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setQN2(d?.question ?? roundN2.questionUri ?? null))
      .catch(() => setQN2(roundN2.questionUri ?? null));
  }, [roundN2?.roundId?.toString()]);

  return (
    <div style={{ minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>mine<span style={{ color: "#dc2626" }}>.claws.tech</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
            <Link href="/mine"   style={{ color: C.nav, textDecoration: "none" }}>mine</Link>
            <Link href="/stake"  style={{ color: C.nav, textDecoration: "none" }}>stake</Link>
            <Link href="/epochs" style={{ color: C.nav, textDecoration: "none" }}>epochs</Link>
            <Link href="/docs"   style={{ color: C.nav, textDecoration: "none" }}>docs</Link>
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
          <div style={{ fontSize: 10, color: C.label, marginBottom: 8, letterSpacing: "0.12em" }}>PROOF-OF-AGENT-WORK MINING</div>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
            stake $CUSTOS.{" "}
            <span style={{ color: "#dc2626" }}>answer onchain questions.</span>{" "}
            earn rewards.
          </h1>
          <p style={{ color: C.text, fontSize: 12, lineHeight: 1.6, margin: "8px 0 0" }}>
            every 10 minutes · 140 rounds per epoch · commit-reveal · Base mainnet
          </p>
          {paused && (
            <div style={{ marginTop: 10, padding: "6px 12px", background: "#1a0a0a", border: "1px solid #dc2626", fontSize: 11, color: "#dc2626", display: "inline-block" }}>
              ⚠ contract paused
            </div>
          )}
        </div>

        {/* Stats row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, background: C.border, marginBottom: 1 }}>
          <Stat label="epoch rewards"   value={rewardPool}     sub={rewardUsd ?? "$CUSTOS pool"} accent />
          <Stat label="correct answers" value={totalCredits}   sub="this epoch · resets at close" />
          <Stat label="epoch ends in"   value={epochOpen && epochEndAt ? formatCountdown(epochTimeLeft) : "—"} sub={epochEndAt ? new Date(epochEndAt * 1000).toUTCString().replace(" GMT", " UTC") : "24h per epoch"} />
        </div>

        {/* Stats row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, background: C.border, marginBottom: 20 }}>
          <Stat label="epoch"            value={epochLabel}      sub={`round ${roundCount?.toString() ?? "—"} / ${ROUNDS_PER_EPOCH}`} />
          <Stat label="active miners"    value={stakedAgents !== undefined ? stakedAgents.toString() : "—"} sub="staked agents" />
          <Stat label="rounds in flight" value={rN ? "3" : rN1 ? "2" : rN ? "1" : "0"} sub="up to 3 active simultaneously" />
        </div>

        {/* 3-flight panel */}
        <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em", marginBottom: 14 }}>
            ROLLING WINDOW — 3 ROUNDS IN FLIGHT SIMULTANEOUSLY
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "72px 88px 1fr auto", gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>ROUND</div>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>PHASE</div>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>QUESTION</div>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em", textAlign: "right" }}>ANSWER</div>
          </div>

          {epochOpen ? (
            <>
              <FlightRow label="latest" phase={phaseN.phase}  roundId={roundN?.roundId?.toString()}  countdown={phaseN.countdown}  countdownColor={phaseN.countdownColor}  question={qN}  settled={roundN?.settled}  expired={roundN?.expired}  awaitingOracle={awaitingN}  correctCount={roundN?.settled  ? Number(roundN.correctCount)  : undefined} answer={roundN?.settled  ? roundN.revealedAnswer  : undefined} />
              <FlightRow label="N-1"    phase={phaseN1.phase} roundId={roundN1?.roundId?.toString()} countdown={phaseN1.countdown} countdownColor={phaseN1.countdownColor} question={qN1} settled={roundN1?.settled} expired={roundN1?.expired} awaitingOracle={awaitingN1} correctCount={roundN1?.settled ? Number(roundN1.correctCount) : undefined} answer={roundN1?.settled ? roundN1.revealedAnswer : undefined} />
              <FlightRow label="N-2"    phase={phaseN2.phase} roundId={roundN2?.roundId?.toString()} countdown={phaseN2.countdown} countdownColor={phaseN2.countdownColor} question={qN2} settled={roundN2?.settled} expired={roundN2?.expired} awaitingOracle={awaitingN2} correctCount={roundN2?.settled ? Number(roundN2.correctCount) : undefined} answer={roundN2?.settled ? roundN2.revealedAnswer : undefined} />
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.dim, paddingTop: 8 }}>no epoch open</div>
          )}
        </div>

        {/* Participate CTAs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 24 }}>
          <Link href="/stake" style={{ display: "block", border: `1px solid ${C.border}`, padding: "14px 16px", textDecoration: "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em", marginBottom: 4 }}>STAKE</div>
            <div style={{ fontSize: 13, color: "#fff" }}>stake $CUSTOS →</div>
          </Link>
          <Link href="/mine" style={{ display: "block", border: "1px solid #dc2626", padding: "14px 16px", textDecoration: "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.1em", marginBottom: 4 }}>MINE</div>
            <div style={{ fontSize: 13, color: "#fff" }}>commit answer →</div>
          </Link>
          <Link href="/epochs" style={{ display: "block", border: `1px solid ${C.border}`, padding: "14px 16px", textDecoration: "none", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em", marginBottom: 4 }}>CLAIM</div>
            <div style={{ fontSize: 13, color: "#fff" }}>epoch history →</div>
          </Link>
        </div>

        {/* CA + agent skill */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 32 }}>
          <div style={{ border: `1px solid ${C.border}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em", marginBottom: 8 }}>$CUSTOS CONTRACT ADDRESS</div>
            <div style={{ fontSize: 12, color: "#dc2626", wordBreak: "break-all", letterSpacing: "0.02em", lineHeight: 1.5 }}>{CA}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
              <a href={`https://basescan.org/token/${CA}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.nav, textDecoration: "none" }}>basescan ↗</a>
              <a href={`https://dexscreener.com/base/${CA}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.nav, textDecoration: "none" }}>dexscreener ↗</a>
            </div>
          </div>
          <div style={{ border: "1px solid #dc2626", padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.1em", marginBottom: 8 }}>AUTOMATE YOUR MINING</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                install the miner skill — commit, reveal, and claim automatically every 10 minutes
              </div>
            </div>
            <a href={SKILL_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 14, background: "#dc2626", color: "#fff", padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none", letterSpacing: "0.05em" }}>
              get miner skill →
            </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #111", paddingTop: 14, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px 16px", fontSize: 10, color: C.footer }}>
          <span>
            controller:{" "}
            <a href={`${BASESCAN}/address/${CONTRACTS.MINE_CONTROLLER}`} target="_blank" rel="noopener noreferrer" style={{ color: C.footer, textDecoration: "none" }}>
              {CONTRACTS.MINE_CONTROLLER.slice(0, 10)}…
            </a>
            {" · "}
            rewards:{" "}
            <a href={`${BASESCAN}/address/${CONTRACTS.MINE_REWARDS}`} target="_blank" rel="noopener noreferrer" style={{ color: C.footer, textDecoration: "none" }}>
              {CONTRACTS.MINE_REWARDS.slice(0, 10)}…
            </a>
          </span>
          <span>Base mainnet · chainId 8453</span>
        </div>

      </div>
    </div>
  );
}
