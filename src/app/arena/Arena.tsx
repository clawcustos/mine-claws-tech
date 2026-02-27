import type { AgentInscription } from "@/hooks/useRoundInscriptions";

export interface FlightRound {
  roundId: string;
  phase: string;
  countdown: number;
  question: string | null;
  revealedAnswer: string | null;
  correctCount: number;
  agents: AgentInscription[];
}
