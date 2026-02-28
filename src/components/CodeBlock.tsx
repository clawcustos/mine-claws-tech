"use client";

import { useState, useCallback } from "react";
import { COLORS } from "@/lib/tokens";

export function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [children]);

  return (
    <div style={{ position: "relative" }}>
      <pre style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        padding: "14px 16px",
        paddingRight: 56,
        fontSize: 11,
        lineHeight: 1.7,
        color: "#aaa",
        overflowX: "auto",
        margin: 0,
      }}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "none",
          border: `1px solid ${copied ? COLORS.green : COLORS.ghost}`,
          color: copied ? COLORS.green : COLORS.dim,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          letterSpacing: "0.04em",
          transition: "color 0.15s, border-color 0.15s",
        }}
      >
        {copied ? "done" : "copy"}
      </button>
    </div>
  );
}
