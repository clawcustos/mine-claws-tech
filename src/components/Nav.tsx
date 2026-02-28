import Link from "next/link";
import { COLORS, SKILL_URL } from "@/lib/tokens";

const PAGES = ["mine", "stake", "epochs", "arena", "docs"] as const;

export function Nav({ active }: { active: string }) {
  return (
    <>
      <style>{`
        .site-nav { padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top, 10px)); }
        .site-nav-skill { display: inline-block; }
        .site-nav-links { display: flex; gap: 14px; font-size: 12px; }
        @media (max-width: 640px) {
          .site-nav { padding: 8px 12px; padding-top: max(8px, env(safe-area-inset-top, 8px)); }
          .site-nav-skill { display: none; }
          .site-nav-links { gap: 10px; font-size: 11px; }
        }
      `}</style>
      <nav className="site-nav" style={{
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Custos" style={{ width: 24, height: 24, borderRadius: 3 }} />
          <span style={{ color: COLORS.white, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
            mine<span style={{ color: COLORS.accent }}>.claws.tech</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
          <div className="site-nav-links">
            {PAGES.map((p) => (
              <Link
                key={p}
                href={`/${p}`}
                style={{
                  color: p === active ? COLORS.white : p === "arena" ? COLORS.accent : COLORS.dim,
                  textDecoration: "none",
                }}
              >
                {p}
              </Link>
            ))}
          </div>
          <a
            href={SKILL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="site-nav-skill"
            style={{
              fontSize: 11,
              color: COLORS.accent,
              textDecoration: "none",
              border: `1px solid ${COLORS.accent}`,
              padding: "4px 10px",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            miner skill →
          </a>
        </div>
      </nav>
    </>
  );
}
