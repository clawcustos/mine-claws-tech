"use client";

import { Canvas } from "@react-three/fiber";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useReadContracts } from "wagmi";
import { CONTRACTS, ROUNDS_PER_EPOCH } from "@/lib/constants";
import { MINE_CONTROLLER_ABI } from "@/lib/abis";
import { useCustosPrice, formatCustosUsd } from "@/hooks/useCustosPrice";
import { formatCustos } from "@/lib/utils";
import { useRoundInscriptions } from "@/hooks/useRoundInscriptions";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Scene } from "./Scene";
import { StatsBar } from "./StatsBar";
import { InspectPanel } from "./InspectPanel";
import { EpochTimeline } from "./EpochTimeline";
import type { AgentInscription } from "@/hooks/useRoundInscriptions";
import type { FlightRound } from "./Arena";

const c = { address: CONTRACTS.MINE_CONTROLLER as `0x${string}`, abi: MINE_CONTROLLER_ABI };
const WINDOW = 600;

export default function ArenaPage() {
  const { price: custosPrice } = useCustosPrice();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [selectedAgent, setSelectedAgent] = useState<(AgentInscription & { roundId: string; phase: string }) | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Core epoch/round state
  const { data } = useReadContracts({
    contracts: [
      { ...c, functionName: "epochOpen" },
      { ...c, functionName: "currentEpochId" },
      { ...c, functionName: "roundCount" },
      { ...c, functionName: "rewardBuffer" },
      { ...c, functionName: "getStakedAgentCount" },
    ],
    query: { refetchInterval: 10_000 },
  });

  const epochOpen = data?.[0]?.result as boolean | undefined;
  const epochId = data?.[1]?.result as bigint | undefined;
  const roundCount = data?.[2]?.result as bigint | undefined;
  const rewardBuf = data?.[3]?.result as bigint | undefined;
  const stakedAgents = data?.[4]?.result as bigint | undefined;

  // Epoch data
  const { data: epochData } = useReadContracts({
    contracts: epochId && epochId > 0n ? [{ ...c, functionName: "getEpoch", args: [epochId] }] : [],
    query: { enabled: !!epochId && epochId > 0n, refetchInterval: 60_000 },
  });
  const epoch = epochData?.[0]?.result as any;

  // 3-flight rounds
  const rN = roundCount && roundCount > 0n ? roundCount : undefined;
  const rN1 = roundCount && roundCount > 1n ? roundCount - 1n : undefined;
  const rN2 = roundCount && roundCount > 2n ? roundCount - 2n : undefined;

  const flight3Contracts = [
    ...(rN ? [{ ...c, functionName: "getRound" as const, args: [rN] }] : []),
    ...(rN1 ? [{ ...c, functionName: "getRound" as const, args: [rN1] }] : []),
    ...(rN2 ? [{ ...c, functionName: "getRound" as const, args: [rN2] }] : []),
  ];

  const { data: flightData } = useReadContracts({
    contracts: flight3Contracts,
    query: { enabled: flight3Contracts.length > 0, refetchInterval: 12_000 },
  });

  let idx = 0;
  const roundN = rN ? (flightData?.[idx++]?.result as any) : undefined;
  const roundN1 = rN1 ? (flightData?.[idx++]?.result as any) : undefined;
  const roundN2 = rN2 ? (flightData?.[idx++]?.result as any) : undefined;

  // Round 1 for epoch end
  const { data: r1Data } = useReadContracts({
    contracts: epochOpen && roundCount && roundCount > 0n
      ? [{ ...c, functionName: "getRound", args: [1n] }] : [],
    query: { enabled: !!epochOpen && !!roundCount && roundCount! > 0n, refetchInterval: 0 },
  });
  const round1 = r1Data?.[0]?.result as any;

  // Question fetching
  const [questionCache, setQuestionCache] = useState<Record<string, string>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const questionCacheRef = useRef<Record<string, string>>({});
  useEffect(() => { questionCacheRef.current = questionCache; }, [questionCache]);

  const fetchQuestion = useCallback((roundId: string) => {
    if (!roundId || questionCacheRef.current[roundId] || fetchingRef.current.has(roundId)) return;
    fetchingRef.current.add(roundId);
    let attempts = 0;
    const MAX = 12;
    function attempt() {
      attempts++;
      fetch(`/api/questions/${roundId}`)
        .then(async (res) => {
          if (res.status === 202) {
            if (attempts < MAX) setTimeout(attempt, 3000);
            else fetchingRef.current.delete(roundId);
            return;
          }
          if (!res.ok) { fetchingRef.current.delete(roundId); return; }
          const d = await res.json();
          if (d?.question) {
            setQuestionCache((prev) => ({ ...prev, [roundId]: d.question }));
            fetchingRef.current.delete(roundId);
          } else if (attempts < MAX) {
            setTimeout(attempt, 3000);
          } else {
            fetchingRef.current.delete(roundId);
          }
        })
        .catch(() => {
          if (attempts < MAX) setTimeout(attempt, 3000);
          else fetchingRef.current.delete(roundId);
        });
    }
    attempt();
  }, []);

  useEffect(() => {
    if (roundN?.roundId) fetchQuestion(roundN.roundId.toString());
    if (roundN1?.roundId) fetchQuestion(roundN1.roundId.toString());
    if (roundN2?.roundId) fetchQuestion(roundN2.roundId.toString());
  }, [roundN?.roundId, roundN1?.roundId, roundN2?.roundId, fetchQuestion]);

  // Per-round inscriptions
  const insN = useRoundInscriptions(roundN?.roundId?.toString());
  const insN1 = useRoundInscriptions(roundN1?.roundId?.toString());
  const insN2 = useRoundInscriptions(roundN2?.roundId?.toString());

  // Phase computation
  function getPhase(r: any): { phase: string; countdown: number } {
    if (!r || r.roundId === 0n) return { phase: "—", countdown: 0 };
    const commitLeft = Math.max(0, Number(r.commitCloseAt) - now);
    const revealLeft = Math.max(0, Number(r.revealCloseAt) - now);
    if (r.settled) return { phase: "settled", countdown: 0 };
    if (r.expired) return { phase: "expired", countdown: 0 };
    if (commitLeft > 0) return { phase: "commit", countdown: commitLeft };
    if (revealLeft > 0) return { phase: "reveal", countdown: revealLeft };
    return { phase: "settling", countdown: 0 };
  }

  const phaseN = getPhase(roundN);
  const phaseN1 = getPhase(roundN1);
  const phaseN2 = getPhase(roundN2);

  // Build live flight rounds from on-chain data
  const liveFlightRounds: FlightRound[] = useMemo(() => {
    const rounds: FlightRound[] = [];
    if (roundN) {
      rounds.push({
        roundId: roundN.roundId.toString(),
        phase: phaseN.phase, countdown: phaseN.countdown,
        question: questionCache[roundN.roundId.toString()] ?? null,
        revealedAnswer: roundN.revealedAnswer || null,
        correctCount: Number(roundN.correctCount),
        agents: insN.data?.agents ?? [],
      });
    }
    if (roundN1) {
      rounds.push({
        roundId: roundN1.roundId.toString(),
        phase: phaseN1.phase, countdown: phaseN1.countdown,
        question: questionCache[roundN1.roundId.toString()] ?? null,
        revealedAnswer: roundN1.revealedAnswer || null,
        correctCount: Number(roundN1.correctCount),
        agents: insN1.data?.agents ?? [],
      });
    }
    if (roundN2) {
      rounds.push({
        roundId: roundN2.roundId.toString(),
        phase: phaseN2.phase, countdown: phaseN2.countdown,
        question: questionCache[roundN2.roundId.toString()] ?? null,
        revealedAnswer: roundN2.revealedAnswer || null,
        correctCount: Number(roundN2.correctCount),
        agents: insN2.data?.agents ?? [],
      });
    }
    return rounds;
  }, [
    roundN, roundN1, roundN2,
    phaseN.phase, phaseN.countdown, phaseN1.phase, phaseN1.countdown, phaseN2.phase, phaseN2.countdown,
    questionCache, insN.data, insN1.data, insN2.data,
  ]);

  // Always show live on-chain rounds (no fallback to old DB rounds)
  const flightRounds: FlightRound[] = liveFlightRounds;

  // Epoch timing
  const epochEndAt: number | undefined = (() => {
    if (epoch?.endAt && Number(epoch.endAt) > 1_700_000_000) return Number(epoch.endAt);
    if (round1?.commitOpenAt && Number(round1.commitOpenAt) > 0)
      return Number(round1.commitOpenAt) + ROUNDS_PER_EPOCH * WINDOW;
    return undefined;
  })();
  const epochTimeLeft = epochEndAt ? Math.max(0, epochEndAt - now) : 0;

  const rewardRaw = (epoch?.rewardPool !== undefined && epoch.rewardPool > 0n)
    ? epoch.rewardPool
    : (rewardBuf !== undefined && rewardBuf > 0n ? rewardBuf : undefined);

  // All rounds for timeline
  const allRoundIds = roundCount && roundCount > 0n
    ? Array.from({ length: Number(roundCount) }, (_, i) => BigInt(i + 1))
    : [];
  const { data: allRoundsData } = useReadContracts({
    contracts: allRoundIds.map((id) => ({ ...c, functionName: "getRound" as const, args: [id] })),
    query: { enabled: allRoundIds.length > 0 && !!epochOpen },
  });

  // Epoch-wide correct / settled stats
  const { totalCorrect, totalSettled } = useMemo(() => {
    let correct = 0, settled = 0;
    if (allRoundsData) {
      for (let i = 0; i < allRoundsData.length; i++) {
        const r = allRoundsData[i]?.result as any;
        if (!r) continue;
        if (r.settled) {
          settled++;
          correct += Number(r.correctCount ?? 0);
        }
      }
    }
    return { totalCorrect: correct, totalSettled: settled };
  }, [allRoundsData]);

  const handleSelectAgent = useCallback((agent: AgentInscription, roundId: string, phase: string) => {
    setSelectedAgent({ ...agent, roundId, phase });
  }, []);

  const handleCloseInspect = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  // Esc key closes InspectPanel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedAgent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="arena-root" style={{ width: "100vw", height: "100dvh", position: "relative", background: "#050302", overflow: "hidden" }}>
      <Canvas
        camera={{ position: [0, 6, 14], fov: 45 }}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => { gl.setClearColor("#050302"); }}
        onPointerMissed={() => setSelectedAgent(null)}
      >
        <Scene
          flightRounds={flightRounds}
          onSelectAgent={handleSelectAgent}
          selectedAgentWallet={selectedAgent?.wallet ?? null}
          selectedRoundId={selectedAgent?.roundId ?? null}
        />
        <EffectComposer>
          <Bloom luminanceThreshold={0.15} intensity={1.2} mipmapBlur />
          <Vignette offset={0.3} darkness={0.8} />
        </EffectComposer>
      </Canvas>

      <StatsBar
        epochId={epochId?.toString()}
        epochOpen={epochOpen}
        roundCount={roundCount ? Number(roundCount) : undefined}
        rewardPool={rewardRaw !== undefined ? formatCustos(rewardRaw) : "—"}
        rewardUsd={rewardRaw !== undefined && custosPrice !== null ? formatCustosUsd(rewardRaw, custosPrice) : undefined}
        stakedAgents={stakedAgents !== undefined ? Number(stakedAgents) : undefined}
        epochTimeLeft={epochTimeLeft}
        totalCorrect={totalCorrect}
        totalSettled={totalSettled}
      />

      {selectedAgent && (
        <InspectPanel
          agent={selectedAgent}
          roundId={selectedAgent.roundId}
          phase={selectedAgent.phase}
          onClose={handleCloseInspect}
        />
      )}

      <EpochTimeline
        allRoundsData={allRoundsData}
        roundCount={roundCount ? Number(roundCount) : 0}
        currentFlightIds={flightRounds.map((r) => r.roundId)}
      />
    </div>
  );
}
