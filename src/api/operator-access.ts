import type { IncomingMessage } from "node:http";

const PROTECTED_PATHS = new Set([
  "/v1/plan",
  "/v1/benchmark",
  "/v1/insights",
  "/v1/whatif",
  "/v1/notify",
  "/v1/openclaw/inbox",
]);
const ROLE_HEADERS = ["x-operator-role", "x-operator-roles"] as const;

export function getStagePilotOperatorToken(): string {
  return String(process.env.STAGEPILOT_OPERATOR_TOKEN || "").trim();
}

export function getStagePilotAllowedRoles(): string[] {
  return String(process.env.STAGEPILOT_OPERATOR_ALLOWED_ROLES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isStagePilotOperatorAuthEnabled(): boolean {
  return getStagePilotOperatorToken().length > 0;
}

export function getStagePilotOperatorRoleHeaders(): readonly string[] {
  return ROLE_HEADERS;
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

function readPresentedRoles(request: IncomingMessage): string[] {
  return ROLE_HEADERS.flatMap((header) => {
    const raw = request.headers[header];
    let values: string[] = [];
    if (Array.isArray(raw)) {
      values = raw;
    } else if (typeof raw === "string") {
      values = [raw];
    }
    return values;
  })
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function hasRequiredStagePilotOperatorRole(
  request: IncomingMessage
): boolean {
  const allowedRoles = getStagePilotAllowedRoles();
  if (allowedRoles.length === 0) {
    return true;
  }
  const presentedRoles = readPresentedRoles(request);
  return presentedRoles.some((role) => allowedRoles.includes(role));
}
