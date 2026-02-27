import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  // Create migrations tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Get already-applied migrations
  const applied = await sql`SELECT name FROM _migrations ORDER BY name`;
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files in order
  const migrationsDir = join(__dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip: ${file} (already applied)`);
      continue;
    }

    const content = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`  apply: ${file}`);

    // Strip SQL comments, split on semicolons, run each statement individually
    const stripped = content.replace(/--[^\n]*/g, "");
    const statements = stripped
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Run each statement sequentially (Neon HTTP can only do one statement per call)
    for (const stmt of statements) {
      await sql.query(stmt);
    }

    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    console.log(`  done: ${file}`);
  }

  console.log("Migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
