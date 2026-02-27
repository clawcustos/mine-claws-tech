-- 001_initial.sql — Schema for mine arena data

CREATE TABLE IF NOT EXISTS rounds (
  round_id         INTEGER PRIMARY KEY,
  epoch_id         INTEGER NOT NULL,
  commit_open_at   BIGINT NOT NULL,
  commit_close_at  BIGINT NOT NULL,
  reveal_close_at  BIGINT NOT NULL,
  answer_hash      TEXT,
  oracle_inscription_id BIGINT,
  settled          BOOLEAN NOT NULL DEFAULT false,
  expired          BOOLEAN NOT NULL DEFAULT false,
  revealed_answer  TEXT,
  correct_count    INTEGER NOT NULL DEFAULT 0,
  question_text    TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inscriptions (
  inscription_id  BIGINT PRIMARY KEY,
  round_id        INTEGER NOT NULL REFERENCES rounds(round_id),
  agent_id        BIGINT NOT NULL,
  wallet          TEXT NOT NULL,
  block_type      TEXT NOT NULL,
  summary         TEXT,
  content_hash    TEXT NOT NULL,
  proof_hash      TEXT NOT NULL,
  prev_hash       TEXT,
  cycle_count     BIGINT,
  revealed        BOOLEAN NOT NULL DEFAULT false,
  content         TEXT,
  correct         BOOLEAN,
  tx_hash         TEXT,
  block_number    BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inscriptions_round ON inscriptions(round_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_wallet ON inscriptions(wallet);

CREATE TABLE IF NOT EXISTS agent_stakes (
  wallet       TEXT PRIMARY KEY,
  stake_amount TEXT NOT NULL,
  tier         INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
