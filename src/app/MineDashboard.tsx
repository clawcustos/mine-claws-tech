"use client";

import { useReadContracts } from "wagmi";
import { useState, useEffect } from "react";
import Link from "next/link";
import { CONTRACTS, BASESCAN, ROUNDS_PER_EPOCH } from "@/lib/constants";
import { MINE_CONTROLLER_ABI } from "@/lib/abis";
import { formatCustos, formatCountdown } from "@/lib/utils";
import { useCustosPrice, formatCustosUsd } from "@/hooks/useCustosPrice";

const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";
const CA = CONTRACTS.CUSTOS_TOKEN;
const c = { address: CONTRACTS.MINE_CONTROLLER as `0x${string}`, abi: MINE_CONTROLLER_ABI };
const WINDOW = 600; // seconds per phase

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
    <div style={{ border: `1px solid ${C.border}`, padding: "12px 14px" }}>
      <div style={{ fontSize: 9, color: C.label, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "clamp(16px, 4vw, 22px)", fontWeight: 700, lineHeight: 1, color: accent ? "#dc2626" : "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.sub, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// Pulsing dot — shows for live phases
function PulseDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: "50%",
      background: color, marginRight: 5, verticalAlign: "middle",
      animation: "pulse 1.8s ease-in-out infinite",
    }} />
  );
}

// Single flight row — responsive card layout
// Mobile: stacked card. Desktop (>600px): 4-column grid via CSS class.
function FlightRow({
  label, phase, roundId, countdown, countdownColor, question, answer, correctCount, settled, expired, awaitingOracle,
}: {
  label: string; phase: string; roundId?: string; countdown?: number; countdownColor: string;
  question?: string | null; answer?: string; correctCount?: number; settled?: boolean; expired?: boolean; awaitingOracle?: boolean;
}) {
  const isLive = phase === "commit" || phase === "reveal";
  const phaseColor = phase === "commit"   ? "#fff"
    : phase === "reveal"   ? "#eab308"
    : phase === "settling" ? "#f97316"
    : phase === "settled"  ? "#22c55e"
    : C.dim;

  const answerEl = settled && answer ? (
    <>
      <span style={{ color: "#22c55e", fontWeight: 600, wordBreak: "break-all" }} title={answer}>
        {answer.length > 22 ? answer.slice(0, 10) + "…" + answer.slice(-8) : answer}
      </span>
      {correctCount !== undefined && (
        <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>
          {correctCount} credit{correctCount !== 1 ? "s" : ""} issued
        </div>
      )}
    </>
  ) : awaitingOracle ? (
    <span style={{ fontSize: 10, color: "#f97316" }}>answer sealed</span>
  ) : null;

  return (
    <div className="flight-row">
      <style>{`
        .flight-row {
          padding: 12px 0;
          border-bottom: 1px solid #111;
          display: grid;
          grid-template-columns: 64px 100px 1fr;
          gap: 10px;
          align-items: start;
        }
        .flight-answer { display: none; }
        .flight-meta   { display: none; }
        @media (min-width: 560px) {
          .flight-row {
            grid-template-columns: 64px 100px 1fr 110px;
          }
          .flight-answer { display: block; text-align: right; }
          .flight-meta   { display: none; }
        }
      `}</style>

      {/* Round */}
      <div>
        <div style={{ fontSize: 9, color: C.label, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{roundId ? `#${roundId}` : "—"}</div>
      </div>

      {/* Phase + countdown */}
      <div>
        <div style={{ fontSize: 11, color: phaseColor, fontWeight: 600, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
          {(isLive || phase === "settling") && <PulseDot color={phaseColor} />}
          {phase.toUpperCase()}
        </div>
        {countdown !== undefined && countdown > 0 && (
          <div style={{ fontSize: 12, color: countdownColor, fontVariantNumeric: "tabular-nums", marginTop: 2, fontWeight: 500 }}>
            {formatCountdown(countdown)}
          </div>
        )}
        {awaitingOracle && (
          <div style={{ fontSize: 9, color: "#f97316", marginTop: 3, lineHeight: 1.4 }}>
            verifying reveals<br /><span style={{ color: C.dim }}>oracle next tick</span>
          </div>
        )}
        {settled && <div style={{ fontSize: 10, color: "#22c55e", marginTop: 2 }}>✓ settled</div>}
        {expired && !settled && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>expired</div>}
      </div>

      {/* Question — on mobile this also shows answer inline below */}
      <div>
        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5, wordBreak: "break-word" }}>
          {question
            ? question
            : roundId
              ? <span style={{ color: "#333", fontStyle: "italic" }}>fetching…</span>
              : "—"}
        </div>
        {/* Mobile-only: answer shown under question */}
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.4 }} className="flight-meta-inline">
          <style>{`.flight-meta-inline { display: block; } @media (min-width: 560px) { .flight-meta-inline { display: none; } }`}</style>
          {answerEl}
        </div>
      </div>

      {/* Desktop-only answer column */}
      <div className="flight-answer" style={{ fontSize: 11 }}>
        {answerEl}
      </div>
    </div>
  );
}

export function MineDashboard() {
  const { price: custosPrice } = useCustosPrice();
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
  // Poll flight rounds every 12s — fast enough to catch settle transitions; countdowns derived client-side
  const { data: flightData, dataUpdatedAt } = useReadContracts({
    contracts: flight3Contracts,
    query: { enabled: flight3Contracts.length > 0 && !!epochOpen, refetchInterval: 12_000 },
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
  const rewardUsd  = rewardRaw !== undefined && custosPrice !== null
    ? `≈ ${formatCustosUsd(rewardRaw, custosPrice)}` : undefined;
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

  /**
   * Fetch question text for a round, retrying every 3 s (up to 12 attempts = 36 s)
   * if the oracle inscription is not yet revealed (202).
   * Never falls back to the raw questionUri — shows null (renders as "—") instead.
   */
  function fetchQuestion(roundId: string, setter: (q: string | null) => void) {
    let attempts = 0;
    const MAX = 12;
    function attempt() {
      attempts++;
      fetch(`/api/questions/${roundId}`)
        .then(async res => {
          if (res.status === 202) {
            // Oracle inscribed but not yet revealed — retry
            if (attempts < MAX) setTimeout(attempt, 3000);
            return;
          }
          if (!res.ok) return;
          const d = await res.json();
          if (d?.question) setter(d.question);
          else if (attempts < MAX) setTimeout(attempt, 3000);
        })
        .catch(() => { if (attempts < MAX) setTimeout(attempt, 3000); });
    }
    attempt();
  }

  useEffect(() => {
    if (!roundN?.roundId) return;
    setQN(null);
    fetchQuestion(roundN.roundId.toString(), setQN);
  }, [roundN?.roundId?.toString()]);

  useEffect(() => {
    if (!roundN1?.roundId) return;
    setQN1(null);
    fetchQuestion(roundN1.roundId.toString(), setQN1);
  }, [roundN1?.roundId?.toString()]);

  useEffect(() => {
    if (!roundN2?.roundId) return;
    setQN2(null);
    fetchQuestion(roundN2.roundId.toString(), setQN2);
  }, [roundN2?.roundId?.toString()]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }
      `}</style>

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
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: "#dc2626", marginBottom: 10, letterSpacing: "0.16em", fontWeight: 600 }}>PROOF-OF-AGENT-WORK MINING</div>
          <h1 style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 700, margin: 0, lineHeight: 1.25, letterSpacing: "-0.02em" }}>
            stake $CUSTOS.{" "}
            <span style={{ color: "#dc2626" }}>answer onchain questions.</span>{" "}
            <span style={{ color: "#fff" }}>earn rewards.</span>
          </h1>
          <p style={{ color: "#888", fontSize: 12, lineHeight: 1.7, margin: "10px 0 0", maxWidth: 580 }}>
            every 10 minutes · 140 rounds per epoch · commit-reveal · Base mainnet
          </p>
          {paused && (
            <div style={{ marginTop: 10, padding: "6px 12px", background: "#1a0a0a", border: "1px solid #dc2626", fontSize: 11, color: "#dc2626", display: "inline-block" }}>
              ⚠ contract paused
            </div>
          )}
        </div>

        {/* What is this — agent framing */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border, marginBottom: 20 }}>
          {([
            ["mine", "Set up an agent on CustosNetwork. Every 10 minutes it answers an onchain question to earn $CUSTOS."],
            ["work", "While mining, your agent can carry out one useful task per loop — anything you configure it to do."],
            ["earn", "Correct answers earn credits. Credits determine your share of the epoch reward pool."],
          ] as [string, string][]).map(([title, desc]) => (
            <div key={title} style={{ background: "#0a0a0a", padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 6 }}>{title.toUpperCase()}</div>
              <div style={{ fontSize: 11, color: "#888", lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Stats row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border, marginBottom: 1 }}>
          <Stat label="epoch rewards"  value={rewardPool}   sub={rewardUsd ?? "$CUSTOS pool"} accent />
          <Stat label="credits issued" value={totalCredits} sub="settled rounds" />
          <Stat label="epoch ends in"  value={epochOpen && epochEndAt ? formatCountdown(epochTimeLeft) : "—"} sub={epochEndAt ? new Date(epochEndAt * 1000).toUTCString().replace(" GMT", " UTC") : "24h / epoch"} />
        </div>

        {/* Stats row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: C.border, marginBottom: 20 }}>
          <Stat label="epoch"            value={epochLabel}  sub={`round ${roundCount?.toString() ?? "—"} / ${ROUNDS_PER_EPOCH}`} />
          <Stat label="active miners"    value={stakedAgents !== undefined ? stakedAgents.toString() : "—"} sub="staked agents" />
          <Stat label="rounds in flight" value={rN ? "3" : rN1 ? "2" : "0"} sub="simultaneous" />
        </div>

        {/* 3-flight panel */}
        <div style={{ border: `1px solid ${C.border}`, padding: "14px 14px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.label, letterSpacing: "0.1em" }}>
              ROLLING WINDOW — 3 ROUNDS IN FLIGHT SIMULTANEOUSLY
            </div>
            {dataUpdatedAt ? (
              <div style={{ fontSize: 9, color: "#333", letterSpacing: "0.04em" }}>
                updated {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            ) : null}
          </div>

          {/* Table header — matches flight-row responsive grid */}
          <div className="flight-header" style={{ marginBottom: 4, paddingBottom: 6, borderBottom: `1px solid #0f0f0f` }}>
            <style>{`
              .flight-header {
                display: grid;
                grid-template-columns: 64px 100px 1fr;
                gap: 10px;
              }
              .flight-header-answer { display: none; }
              @media (min-width: 560px) {
                .flight-header { grid-template-columns: 64px 100px 1fr 110px; }
                .flight-header-answer { display: block; text-align: right; }
              }
            `}</style>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>ROUND</div>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>PHASE</div>
            <div style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>QUESTION</div>
            <div className="flight-header-answer" style={{ fontSize: 9, color: C.tableHdr, letterSpacing: "0.08em" }}>ANSWER / CREDITS</div>
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
              <div style={{ fontSize: 10, color: "#dc2626", letterSpacing: "0.1em", marginBottom: 8 }}>DEPLOY AN AGENT</div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                install the miner skill on OpenClaw. your agent mines every 10 min automatically — and carries out any useful task you configure in the same loop.
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
