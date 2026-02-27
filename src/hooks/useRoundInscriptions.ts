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

    // Reset on roundId change
    if (prevRoundId.current !== roundId) {
      setData(null);
      prevRoundId.current = roundId;
    }

    setLoading(true);
    fetchData(roundId).finally(() => setLoading(false));

    // Poll every 4s for active rounds (DB-backed API is fast enough)
    intervalRef.current = setInterval(() => {
      // Don't poll settled/expired rounds
      if (data?.phase === "settled" || data?.phase === "expired") return;
      fetchData(roundId);
    }, 4_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [roundId, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
