import type { IncomingMessage } from "node:http";

const PROTECTED_PATHS = new Set([
  "/v1/plan",
  "/v1/benchmark",
  "/v1/insights",
  "/v1/whatif",
  "/v1/notify",
  "/v1/openclaw/inbox",
]);

export function getStagePilotOperatorToken(): string {
  return String(process.env.STAGEPILOT_OPERATOR_TOKEN || "").trim();
}

export function isStagePilotOperatorAuthEnabled(): boolean {
  return getStagePilotOperatorToken().length > 0;
}

export function readBearerToken(value: string | undefined): string {
  const auth = String(value || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return auth.slice("bearer ".length).trim();
}

export function requiresStagePilotOperatorToken(
  method: string,
  pathname: string
): boolean {
  return method === "POST" && PROTECTED_PATHS.has(pathname);
}

export function hasValidStagePilotOperatorToken(
  request: IncomingMessage
): boolean {
  const expected = getStagePilotOperatorToken();
  if (!expected) {
    return true;
  }
  const headerToken = String(request.headers["x-operator-token"] || "").trim();
  const bearerToken =
    typeof request.headers.authorization === "string"
      ? readBearerToken(request.headers.authorization)
      : "";
  return headerToken === expected || bearerToken === expected;
}
