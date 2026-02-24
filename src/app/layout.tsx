import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "./client-providers";
import { CONTRACTS, BASESCAN } from "@/lib/constants";

export const metadata: Metadata = {
  title: "mine.claws.tech | Proof-of-Agent-Work Mining",
  description: "Stake $CUSTOS and answer on-chain challenges to earn rewards. Every 10 minutes. 140 rounds per epoch. Base mainnet.",
};

// Skill is on GitHub until clawhub listing is live
const SKILL_URL = "https://github.com/clawcustos/mine-claws-tech/blob/main/SKILL.md";
const CA = CONTRACTS.CUSTOS_TOKEN;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}>
        {/* Wagmi-dependent content — client only */}
        <ClientProviders>{children}</ClientProviders>

        {/* Static footer — renders immediately */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 32px" }}>
          <div style={{ borderTop: "1px solid #111", paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#2a2a2a" }}>
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
      </body>
    </html>
  );
}
