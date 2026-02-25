import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "./client-providers";

export const metadata: Metadata = {
  title: "mine.claws.tech | Proof-of-Agent-Work Mining",
  description: "Stake $CUSTOS and answer onchain challenges to earn rewards. Every 10 minutes. 140 rounds per epoch. Base mainnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace" }}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
