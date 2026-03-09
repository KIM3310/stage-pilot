import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

interface StagePilotOperatorSessionRecord {
  authMode: "oidc" | "token";
  credential: string;
  expiresAt: string;
  issuedAt: string;
  roles: string[];
  subject: string | null;
}

export type StagePilotOperatorSessionView = Omit<
  StagePilotOperatorSessionRecord,
  "credential"
>;

const DEFAULT_COOKIE_NAME = "stagepilot_operator_session";
const DEFAULT_TTL_SEC = 12 * 60 * 60;

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getCookieName(): string {
  return (
    String(process.env.STAGEPILOT_OPERATOR_SESSION_COOKIE || "").trim() ||
    DEFAULT_COOKIE_NAME
  );
}

function getSessionSecret(): string {
  return (
    String(process.env.STAGEPILOT_OPERATOR_SESSION_SECRET || "").trim() ||
    String(process.env.STAGEPILOT_OPERATOR_TOKEN || "").trim() ||
    "stagepilot-local-session-secret"
  );
}

function getSessionTtlSec(): number {
  const parsed = Number.parseInt(
    String(process.env.STAGEPILOT_OPERATOR_SESSION_TTL_SEC || ""),
    10
  );
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SEC;
  }
  return Math.min(parsed, 7 * 24 * 60 * 60);
}

function useSecureCookie(): boolean {
  const configured = String(
    process.env.STAGEPILOT_OPERATOR_SESSION_SECURE || ""
  )
    .trim()
    .toLowerCase();
  if (configured === "1" || configured === "true" || configured === "yes") {
    return true;
  }
  if (configured === "0" || configured === "false" || configured === "no") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function parseCookieHeader(value: string | undefined): Record<string, string> {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, chunk) => {
      const separator = chunk.indexOf("=");
      if (separator <= 0) {
        return cookies;
      }
      const key = chunk.slice(0, separator).trim();
      const val = chunk.slice(separator + 1).trim();
      if (key) {
        cookies[key] = val;
      }
      return cookies;
    }, {});
}

function isExpired(record: StagePilotOperatorSessionRecord): boolean {
  return Date.parse(record.expiresAt) <= Date.now();
}

function readSessionRecord(
  request: IncomingMessage
): StagePilotOperatorSessionRecord | null {
  const encoded = parseCookieHeader(
    typeof request.headers.cookie === "string" ? request.headers.cookie : ""
  )[getCookieName()];
  if (!encoded) {
    return null;
  }
  const separator = encoded.indexOf(".");
  if (separator <= 0) {
    return null;
  }
  const payload = encoded.slice(0, separator);
  const signature = encoded.slice(separator + 1);
  const expected = signPayload(payload);
  if (!signaturesMatch(signature, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fromBase64Url(payload)
    ) as StagePilotOperatorSessionRecord;
    if (!parsed || typeof parsed !== "object" || !parsed.credential) {
      return null;
    }
    if (isExpired(parsed)) {
      return null;
    }
    return {
      authMode: parsed.authMode,
      credential: String(parsed.credential),
      expiresAt: String(parsed.expiresAt),
      issuedAt: String(parsed.issuedAt),
      roles: Array.isArray(parsed.roles)
        ? parsed.roles
            .map((item) => String(item).trim().toLowerCase())
            .filter(Boolean)
        : [],
      subject: parsed.subject ? String(parsed.subject) : null,
    };
  } catch {
    return null;
  }
}

export function getStagePilotOperatorSessionCookieName(): string {
  return getCookieName();
}

export function readStagePilotOperatorSession(
  request: IncomingMessage
): StagePilotOperatorSessionView | null {
  const session = readSessionRecord(request);
  if (!session) {
    return null;
  }
  return {
    authMode: session.authMode,
    expiresAt: session.expiresAt,
    issuedAt: session.issuedAt,
    roles: session.roles,
    subject: session.subject,
  };
}

export function applyStagePilotOperatorSession(
  request: IncomingMessage
): StagePilotOperatorSessionView | null {
  const session = readSessionRecord(request);
  if (!session) {
    return null;
  }
  if (
    !(
      String(request.headers.authorization || "").trim() ||
      String(request.headers["x-operator-token"] || "").trim()
    )
  ) {
    if (session.authMode === "oidc") {
      request.headers.authorization = `Bearer ${session.credential}`;
    } else {
      request.headers["x-operator-token"] = session.credential;
    }
  }
  if (
    !(
      String(request.headers["x-operator-role"] || "").trim() ||
      String(request.headers["x-operator-roles"] || "").trim()
    ) &&
    session.roles.length > 0
  ) {
    request.headers["x-operator-roles"] = session.roles.join(",");
  }
  return {
    authMode: session.authMode,
    expiresAt: session.expiresAt,
    issuedAt: session.issuedAt,
    roles: session.roles,
    subject: session.subject,
  };
}

export function createStagePilotOperatorSessionCookie(options: {
  authMode: "oidc" | "token";
  credential: string;
  roles: string[];
  subject: string | null;
}): { cookie: string; session: StagePilotOperatorSessionView } {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + getSessionTtlSec() * 1000
  ).toISOString();
  const payload = toBase64Url(
    JSON.stringify({
      authMode: options.authMode,
      credential: options.credential,
      expiresAt,
      issuedAt,
      roles: options.roles,
      subject: options.subject,
    } satisfies StagePilotOperatorSessionRecord)
  );
  const signature = signPayload(payload);
  const cookieParts = [
    `${getCookieName()}=${payload}.${signature}`,
    "Path=/",
    `Max-Age=${getSessionTtlSec()}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (useSecureCookie()) {
    cookieParts.push("Secure");
  }
  return {
    cookie: cookieParts.join("; "),
    session: {
      authMode: options.authMode,
      expiresAt,
      issuedAt,
      roles: options.roles,
      subject: options.subject,
    },
  };
}

export function clearStagePilotOperatorSessionCookie(): string {
  const cookieParts = [
    `${getCookieName()}=`,
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (useSecureCookie()) {
    cookieParts.push("Secure");
  }
  return cookieParts.join("; ");
}
