import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface StagePilotRuntimeEvent {
  method: string;
  path: string;
  requestId?: string;
  statusCode: number;
  timestamp: string;
}

function resolveStorePath(): string {
  const configured = String(
    process.env.STAGEPILOT_RUNTIME_STORE_PATH || ""
  ).trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(
    process.cwd(),
    ".runtime",
    "stagepilot-runtime-events.jsonl"
  );
}

export function appendStagePilotRuntimeEvent(
  event: StagePilotRuntimeEvent
): void {
  const targetPath = resolveStorePath();
  mkdirSync(path.dirname(targetPath), { recursive: true });
  appendFileSync(targetPath, `${JSON.stringify(event)}\n`, "utf8");
}

export function buildStagePilotRuntimeStoreSummary(limit = 25) {
  const targetPath = resolveStorePath();
  if (!existsSync(targetPath)) {
    return {
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
    enabled: true,
    path: targetPath,
    persistedCount: lines.length,
    lastEventAt,
    methodCounts,
    statusClasses,
    recentEvents,
  };
}

type WorkflowLane = "merge-request" | "pipeline-recovery" | "release-governor";

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

function readRuntimeEvents(): StagePilotRuntimeEvent[] {
  const targetPath = resolveStorePath();
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

export function buildStagePilotWorkflowRunList(options?: {
  lane?: WorkflowLane;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(Math.trunc(options?.limit ?? 10), 25));
  const laneFilter = options?.lane;
  const events = readRuntimeEvents().filter((event) => {
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
  const events = readRuntimeEvents()
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
