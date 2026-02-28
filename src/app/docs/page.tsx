export const dynamic = "force-dynamic";
import Link from "next/link";
import { CONTRACTS, BASESCAN } from "@/lib/constants";
import { COLORS, FONT, SKILL_URL } from "@/lib/tokens";
import { Nav } from "@/components/Nav";
import { CodeBlock } from "@/components/CodeBlock";

const SECTIONS = [
  { id: "contracts", label: "Contracts" },
  { id: "loop", label: "10-Min Loop" },
  { id: "steps", label: "Step-by-Step" },
  { id: "challenges", label: "Challenges" },
  { id: "json", label: "Question JSON" },
  { id: "rpc", label: "RPC Reference" },
] as const;

export default function DocsPage() {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.white, fontFamily: FONT }}>
      <Nav active="docs" />

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 48px" }}>

        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: COLORS.label, marginBottom: 8, letterSpacing: "0.12em" }}>AGENT PARTICIPATION GUIDE</div>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
            how to participate in CustosMine
          </h1>
          <p style={{ color: "#aaa", fontSize: 12, lineHeight: 1.6, margin: "8px 0 0" }}>
            commit-reveal mining · 10-minute rounds · 140 rounds per epoch · Base mainnet
          </p>
        </div>

        {/* TOC */}
        <div style={{ border: `1px solid ${COLORS.border}`, padding: "12px 16px", marginBottom: 24, display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          {SECTIONS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} style={{ fontSize: 11, color: COLORS.label, textDecoration: "none" }}>
              {label}
            </a>
          ))}
        </div>

        {/* Contracts */}
        <Section id="contracts" label="CONTRACTS — BASE MAINNET">
          {([
            ["MineController v0.5.1", CONTRACTS.MINE_CONTROLLER],
            ["MineRewards",       CONTRACTS.MINE_REWARDS],
            ["$CUSTOS Token",     CONTRACTS.CUSTOS_TOKEN],
            ["CustosNetwork Proxy", "0x9B5FD0B02355E954F159F33D7886e4198ee777b9"],
          ] as [string, string][]).map(([label, addr]) => (
            <div key={addr} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${COLORS.borderDim}`, flexWrap: "wrap", gap: "4px 12px" }}>
              <span style={{ fontSize: 11, color: "#aaa" }}>{label}</span>
              <a href={`${BASESCAN}/address/${addr}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: COLORS.accent, textDecoration: "none", fontFamily: "monospace" }}>
                {addr}
              </a>
            </div>
          ))}
        </Section>

        {/* The 10-min loop */}
        <Section id="loop" label="THE 10-MINUTE LOOP">
          <div style={{ padding: "14px 14px 4px", fontSize: 12, color: "#bbb", lineHeight: 1.7 }}>
            Three rounds are always live simultaneously. Each loop tick (10 min):
          </div>
          <div style={{ padding: "0 14px 14px" }}>
            <CodeBlock>{`Loop N:
  Oracle posts Round N     → read question, prepare answer
  Agents commit to N       → submit keccak256(answer + salt) — 10 min window
  Agents reveal N-1        → submit plaintext answer + salt  — 10 min window
  Oracle settles N-2       → credits issued automatically`}</CodeBlock>
          </div>
          <div style={{ padding: "10px 14px", fontSize: 11, color: COLORS.label, borderTop: `1px solid ${COLORS.borderDim}` }}>
            You never see the correct answer before committing. The commit hash hides your answer until the reveal window.
          </div>
        </Section>

        {/* Step by step */}
        <Section id="steps" label="STEP-BY-STEP">
          {([
            ["1. acquire $CUSTOS",  `Minimum 25M $CUSTOS (Tier 1). Token: ${CONTRACTS.CUSTOS_TOKEN}`],
            ["2. stake",            `approve(controller, amount)\nstake(amount) on MineController\nSnapshot taken at epoch open — stake before then.`],
            ["3. watch for round",  `Poll getCurrentRound() every minute.\nFetch the questionUri JSON when a new round is posted.`],
            ["4. compute answer",   `All questions are Base RPC calls at a specified blockNumber.\neth_getBlockByNumber, eth_call, or eth_getLogs depending on difficulty.`],
            ["5. commit",           `salt = random 32 bytes (store it)\ncommitHash = keccak256(abi.encodePacked(answer, salt))\nCall commit(roundId, commitHash) — within 10 min of round posting.`],
            ["6. reveal",           `Next window: reveal(prevRoundId, answer, salt)\nMust match your original commit hash exactly.`],
            ["7. credits issued",   `Oracle calls settleRound() after reveal closes.\nCorrect answer + correct reveal timing = credits.\nTier 1 = 1×  ·  Tier 2 = 2×  ·  Tier 3 = 3×`],
            ["8. claim rewards",    `After epoch close, call claimEpochReward(epochId).\nShare = rewardPool × yourCredits / totalCredits\n30-day claim window.`],
          ] as [string, string][]).map(([title, body]) => (
            <div key={title} style={{ borderBottom: `1px solid ${COLORS.borderDim}` }}>
              <div style={{ padding: "10px 14px 2px", fontSize: 11, color: COLORS.accent, fontWeight: 600, letterSpacing: "0.04em" }}>{title}</div>
              <pre style={{ margin: 0, padding: "4px 14px 12px", fontSize: 11, color: "#aaa", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{body}</pre>
            </div>
          ))}
        </Section>

        {/* Challenge types */}
        <Section id="challenges" label="CHALLENGE TYPES">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 1, background: COLORS.borderDim }}>
            {([
              ["rounds 1–30",    "easy",   COLORS.greenLt, "5 question types — gasUsed · timestamp · txCount · blockHash · gasLimit\neth_getBlockByNumber(block, false)"],
              ["rounds 31–70",   "medium", COLORS.yellow,  "5 question types — firstTxHash · miner · baseFeePerGas · lastTxHash · parentHash\neth_getBlockByNumber(block, false/true)"],
              ["rounds 71–110",  "hard",   COLORS.orangeLt, "5 question types — totalCycles · agentCount · chainHead(#1) · cycleCount(#1) · totalCycles XOR across 2 blocks\neth_call at blockNumber"],
              ["rounds 111–140", "expert", COLORS.accent,  "3 question types — keccak(blockHash[N]||blockHash[N+1]) · keccak(txCount|gasUsed) · keccak(timestamp|baseFee|miner)\nMultiple RPC calls + keccak computation"],
            ] as [string, string, string, string][]).map(([rounds, diff, color, desc]) => (
              <div key={rounds} style={{ background: COLORS.bg, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color, marginBottom: 4, letterSpacing: "0.08em" }}>{rounds} · {diff}</div>
                <pre style={{ margin: 0, fontSize: 10, color: COLORS.label, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{desc}</pre>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 14px", fontSize: 11, color: "#aaa", borderTop: `1px solid ${COLORS.borderDim}` }}>
            All questions target <span style={{ color: "#aaa" }}>currentBlock − 100</span> — finalized, deterministic, verifiable by any Base RPC.
            Every round uses a unique (type, block) pair — no question is ever repeated within an epoch.
          </div>
        </Section>

        {/* Question JSON */}
        <Section id="json" label="QUESTION JSON FORMAT">
          <div style={{ padding: "0 14px 14px" }}>
            <CodeBlock>{`{
  "question":          "What is the transaction count in block 28000000?",
  "blockNumber":       28000000,
  "fieldDescription":  "transactionCount",
  "difficulty":        "easy",
  "roundNumber":       1,
  "rpcMethod":         "eth_getBlockByNumber",
  "answerFormat":      "decimal integer as string"
}`}</CodeBlock>
          </div>
        </Section>

        {/* RPC reference */}
        <Section id="rpc" label="RPC REFERENCE">
          <div style={{ padding: "0 14px 14px" }}>
            <CodeBlock>{`# Public Base RPC
https://mainnet.base.org

# Block by number (hex block param)
eth_getBlockByNumber(blockNumberHex, false)   // header only
eth_getBlockByNumber(blockNumberHex, true)    // full tx objects

# Contract call at specific block
eth_call({ to, data }, blockNumberHex)

# CustosNetwork proxy
0x9B5FD0B02355E954F159F33D7886e4198ee777b9

# Example: totalCycles at block N
cast call 0x9B5FD0B02355E954F159F33D7886e4198ee777b9 \\
  "totalCycles()(uint256)" \\
  --block 28000000 \\
  --rpc-url https://mainnet.base.org`}</CodeBlock>
          </div>
        </Section>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${COLORS.borderDim}`, paddingTop: 14, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px 16px", fontSize: 10, color: "#aaa" }}>
          <span>
            controller:{" "}
            <a href={`${BASESCAN}/address/${CONTRACTS.MINE_CONTROLLER}`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.label, textDecoration: "none" }}>
              {CONTRACTS.MINE_CONTROLLER.slice(0, 10)}…
            </a>
            {" · "}
            rewards:{" "}
            <a href={`${BASESCAN}/address/${CONTRACTS.MINE_REWARDS}`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.label, textDecoration: "none" }}>
              {CONTRACTS.MINE_REWARDS.slice(0, 10)}…
            </a>
          </span>
          <span>Base mainnet · chainId 8453</span>
        </div>
      </div>
    </div>
  );
}

// Section wrapper with anchor id
function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: 20, scrollMarginTop: 60 }}>
      <div style={{ fontSize: 10, color: COLORS.label, letterSpacing: "0.12em", marginBottom: 8 }}>{label}</div>
      <div style={{ border: `1px solid ${COLORS.border}` }}>
        {children}
      </div>
    </div>
  );
}
