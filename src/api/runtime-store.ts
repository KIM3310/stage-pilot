import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export interface StagePilotRuntimeEvent {
  method: string;
  path: string;
  requestId?: string;
  statusCode: number;
  timestamp: string;
}

type RuntimeStoreBackend = "jsonl" | "sqlite";
type WorkflowLane = "merge-request" | "pipeline-recovery" | "release-governor";
type SqliteRow = Record<string, unknown>;
interface SqliteStatement {
  all(...params: unknown[]): SqliteRow[];
  get(...params: unknown[]): SqliteRow;
  run(...params: unknown[]): void;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
type DatabaseSyncCtor = new (targetPath: string) => SqliteDatabase;

const require = createRequire(import.meta.url);
let cachedDatabaseSyncCtor: DatabaseSyncCtor | null | undefined;

function getDatabaseSyncCtor(): DatabaseSyncCtor | null {
  if (cachedDatabaseSyncCtor !== undefined) {
    return cachedDatabaseSyncCtor;
  }
  try {
    cachedDatabaseSyncCtor = require("node:sqlite")
      .DatabaseSync as DatabaseSyncCtor;
  } catch {
    cachedDatabaseSyncCtor = null;
  }
  return cachedDatabaseSyncCtor;
}

function resolveStorePath(): string {
  const configured = String(
    process.env.STAGEPILOT_RUNTIME_STORE_PATH || ""
  ).trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(process.cwd(), ".runtime", "stagepilot-runtime-events.db");
}

function resolveStoreBackend(targetPath: string): RuntimeStoreBackend {
  const configured = String(process.env.STAGEPILOT_RUNTIME_STORE_BACKEND || "")
    .trim()
    .toLowerCase();
  if (configured === "jsonl" || configured === "sqlite") {
    return configured === "sqlite" && getDatabaseSyncCtor() === null
      ? "jsonl"
      : configured;
  }
  const preferredBackend = targetPath.endsWith(".jsonl") ? "jsonl" : "sqlite";
  return preferredBackend === "sqlite" && getDatabaseSyncCtor() === null
    ? "jsonl"
    : preferredBackend;
}

function ensureSqliteStore(targetPath: string): SqliteDatabase {
  const DatabaseSync = getDatabaseSyncCtor();
  if (DatabaseSync === null) {
    throw new Error("node:sqlite is unavailable in this runtime");
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const database = new DatabaseSync(targetPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS runtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      request_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stagepilot_runtime_events_timestamp
      ON runtime_events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_stagepilot_runtime_events_path
      ON runtime_events(path);
  `);
  return database;
}

function laneForPath(pathname: string): WorkflowLane | null {
  switch (pathname) {
    case "/v1/plan":
    case "/v1/insights":
      return "merge-request";
    case "/v1/benchmark":
    case "/v1/whatif":
      return "pipeline-recovery";
    case "/v1/notify":
    case "/v1/openclaw/inbox":
      return "release-governor";
    default:
      return null;
  }
}

function buildJsonlSummary(targetPath: string, limit: number) {
  if (!existsSync(targetPath)) {
    return {
      backend: "jsonl" as const,
      enabled: true,
      path: targetPath,
      persistedCount: 0,
      lastEventAt: null as string | null,
      methodCounts: {} as Record<string, number>,
      statusClasses: {
        ok: 0,
        clientError: 0,
        serverError: 0,
      },
      recentEvents: [] as StagePilotRuntimeEvent[],
    };
  }

  const lines = readFileSync(targetPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const recentEvents = lines
    .slice(-Math.max(1, limit))
    .map((line) => {
      try {
        return JSON.parse(line) as StagePilotRuntimeEvent;
      } catch {
        return null;
      }
    })
    .filter((item): item is StagePilotRuntimeEvent => item !== null);

  const methodCounts: Record<string, number> = {};
  const statusClasses = {
    ok: 0,
    clientError: 0,
    serverError: 0,
  };
  let lastEventAt: string | null = null;

  for (const event of recentEvents) {
    const method = String(event.method || "UNKNOWN").toUpperCase();
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;
    if (event.statusCode >= 500) {
      statusClasses.serverError += 1;
    } else if (event.statusCode >= 400) {
      statusClasses.clientError += 1;
    } else {
      statusClasses.ok += 1;
    }
    if (lastEventAt === null || event.timestamp > lastEventAt) {
      lastEventAt = event.timestamp;
    }
  }

  return {
    backend: "jsonl" as const,
    enabled: true,
    path: targetPath,
    persistedCount: lines.length,
    lastEventAt,
    methodCounts,
    statusClasses,
    recentEvents,
  };
}

function buildSqliteSummary(targetPath: string, limit: number) {
  const database = ensureSqliteStore(targetPath);
  const countRow = database
    .prepare(
      "SELECT COUNT(*) as count, MAX(timestamp) as last_event_at FROM runtime_events"
    )
    .get() as { count?: number; last_event_at?: string | null };
  const methodRows = database
    .prepare(
      "SELECT method, COUNT(*) as count FROM runtime_events GROUP BY method ORDER BY method ASC"
    )
    .all() as Array<{ count?: number; method?: string }>;
  const statusRow = database
    .prepare(
      `SELECT
        SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as client_error,
        SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error
      FROM runtime_events`
    )
    .get() as {
    client_error?: number;
    ok?: number;
    server_error?: number;
  };
  const recentEvents = database
    .prepare(
      `SELECT
        method,
        path,
        request_id as requestId,
        status_code as statusCode,
        timestamp
      FROM runtime_events
      ORDER BY id DESC
      LIMIT ?`
    )
    .all(Math.max(1, limit))
    .map((row) => ({
      method: String(row.method || ""),
      path: String(row.path || ""),
      requestId: row.requestId ? String(row.requestId) : undefined,
      statusCode: Number(row.statusCode || 0),
      timestamp: String(row.timestamp || ""),
    })) satisfies StagePilotRuntimeEvent[];

  return {
    backend: "sqlite" as const,
    enabled: true,
    path: targetPath,
    persistedCount: Number(countRow.count || 0),
    lastEventAt: countRow.last_event_at || null,
    methodCounts: Object.fromEntries(
      methodRows.map((row) => [
        String(row.method || "UNKNOWN").toUpperCase(),
        Number(row.count || 0),
      ])
    ),
    statusClasses: {
      ok: Number(statusRow.ok || 0),
      clientError: Number(statusRow.client_error || 0),
      serverError: Number(statusRow.server_error || 0),
    },
    recentEvents: recentEvents.reverse(),
  };
}

function readAllRuntimeEvents(): StagePilotRuntimeEvent[] {
  const targetPath = resolveStorePath();
  const backend = resolveStoreBackend(targetPath);

  if (backend === "jsonl") {
    if (!existsSync(targetPath)) {
      return [];
    }
    return readFileSync(targetPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as StagePilotRuntimeEvent;
        } catch {
          return null;
        }
      })
      .filter((item): item is StagePilotRuntimeEvent => item !== null);
  }

  const database = ensureSqliteStore(targetPath);
  return database
    .prepare(
      `SELECT
        method,
        path,
        request_id as requestId,
        status_code as statusCode,
        timestamp
      FROM runtime_events
      ORDER BY id ASC`
    )
    .all()
    .map((row) => ({
      method: String(row.method || ""),
      path: String(row.path || ""),
      requestId: row.requestId ? String(row.requestId) : undefined,
      statusCode: Number(row.statusCode || 0),
      timestamp: String(row.timestamp || ""),
    })) satisfies StagePilotRuntimeEvent[];
}

export function appendStagePilotRuntimeEvent(
  event: StagePilotRuntimeEvent
): void {
  const targetPath = resolveStorePath();
  const backend = resolveStoreBackend(targetPath);
  if (backend === "jsonl") {
    mkdirSync(path.dirname(targetPath), { recursive: true });
    appendFileSync(targetPath, `${JSON.stringify(event)}\n`, "utf8");
    return;
  }

  const database = ensureSqliteStore(targetPath);
  database
    .prepare(
      `INSERT INTO runtime_events (
        timestamp,
        method,
        path,
        status_code,
        request_id
      ) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      event.timestamp,
      event.method,
      event.path,
      event.statusCode,
      event.requestId ?? null
    );
}

export function buildStagePilotRuntimeStoreSummary(limit = 25) {
  const targetPath = resolveStorePath();
  const backend = resolveStoreBackend(targetPath);
  return backend === "jsonl"
    ? buildJsonlSummary(targetPath, limit)
    : buildSqliteSummary(targetPath, limit);
}

export function buildStagePilotWorkflowRunList(options?: {
  lane?: WorkflowLane;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(Math.trunc(options?.limit ?? 10), 25));
  const laneFilter = options?.lane;
  const events = readAllRuntimeEvents().filter((event) => {
    if (event.method.toUpperCase() !== "POST") {
      return false;
    }
    const lane = laneForPath(event.path);
    if (!lane) {
      return false;
    }
    return laneFilter ? lane === laneFilter : true;
  });

  const items = events
    .slice()
    .reverse()
    .map((event) => ({
      lane: laneForPath(event.path),
      path: event.path,
      requestId: event.requestId ?? null,
      status: event.statusCode >= 400 ? "attention" : "ok",
      statusCode: event.statusCode,
      timestamp: event.timestamp,
    }))
    .slice(0, limit);

  return {
    ok: true,
    service: "stagepilot-workflow-runs",
    generatedAt: new Date().toISOString(),
    schema: "stagepilot-workflow-runs-v1",
    filters: {
      lane: laneFilter ?? null,
      limit,
    },
    summary: {
      totalRuns: events.length,
      lanes: Array.from(
        new Set(
          events
            .map((event) => laneForPath(event.path))
            .filter((lane): lane is WorkflowLane => lane !== null)
        )
      ),
    },
    items,
  };
}

export function buildStagePilotWorkflowRunDetail(requestId: string) {
  const events = readAllRuntimeEvents()
    .filter((event) => event.requestId === requestId)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  if (events.length === 0) {
    return null;
  }
  const first = events[0];
  const lane = laneForPath(first.path);
  return {
    ok: true,
    service: "stagepilot-workflow-run-detail",
    generatedAt: new Date().toISOString(),
    schema: "stagepilot-workflow-run-detail-v1",
    requestId,
    lane,
    status: events.some((event) => event.statusCode >= 400)
      ? "attention"
      : "ok",
    timeline: events.map((event) => ({
      method: event.method,
      path: event.path,
      statusCode: event.statusCode,
      timestamp: event.timestamp,
    })),
    links: {
      runtimeBrief: "/v1/runtime-brief",
      runtimeScorecard: "/v1/runtime-scorecard",
      developerOpsPack: "/v1/developer-ops-pack",
      workflowRuns: "/v1/workflow-runs",
      reviewPack: "/v1/review-pack",
    },
  };
}
