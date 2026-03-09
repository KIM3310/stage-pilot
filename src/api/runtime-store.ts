import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface StagePilotRuntimeEvent {
  method: string;
  path: string;
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

  return {
    enabled: true,
    path: targetPath,
    persistedCount: lines.length,
    recentEvents,
  };
}
