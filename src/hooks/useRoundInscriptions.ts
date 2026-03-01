"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface AgentInscription {
  inscriptionId: string;
  wallet: string;
  revealed: boolean;
  content: string | null;
  correct: boolean | null;
  tier: number;
}

export interface RoundInscriptions {
  roundId: number;
  phase: string;
  question: string | null;
  revealedAnswer: string | null;
  correctCount: number;
  agents: AgentInscription[];
}

export function useRoundInscriptions(roundId: string | undefined) {
  const [data, setData] = useState<RoundInscriptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRoundId = useRef<string | undefined>(undefined);
  const dataRef = useRef<RoundInscriptions | null>(null);

  // Keep ref in sync so interval callback sees current data
  dataRef.current = data;

  const fetchData = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/mine/round-inscriptions/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setData(null);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!roundId) {
      setData(null);
      setLoading(false);
      return;
    }

    // Track roundId change — do NOT clear data here.
    // Keep stale data visible until the new fetch completes,
    // so cubes don't disappear during the ~300ms fetch gap.
    prevRoundId.current = roundId;

    setLoading(true);
    fetchData(roundId).finally(() => setLoading(false));

    // Poll every 2s for near-instant updates
    intervalRef.current = setInterval(() => {
      const d = dataRef.current;
      const phase = d?.phase;
      // Keep polling settled rounds until correct flags are populated,
      // otherwise we stop with stale correct=null for all agents
      if (phase === "settled" || phase === "expired") {
        const hasCorrects = d?.agents?.some((a) => a.correct !== null);
        if (hasCorrects) return; // truly done — stop polling
      }
      fetchData(roundId);
    }, 2_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [roundId, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
