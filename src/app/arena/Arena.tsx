import type { AgentInscription } from "@/hooks/useRoundInscriptions";

export interface FlightRound {
  roundId: string;
  displayRoundNum?: number;
  phase: string;
  countdown: number;
  question: string | null;
  revealedAnswer: string | null;
  correctCount: number;
  agents: AgentInscription[];
}
