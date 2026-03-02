import { createPublicKey, verify as verifySignature } from "node:crypto";
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
const ACCEPTED_HEADERS = [
  "authorization: Bearer <token>",
  "x-operator-token",
] as const;
const OIDC_CACHE_TTL_MS = 5 * 60 * 1000;
const TRAILING_SLASH_REGEX = /\/$/;

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  groups?: unknown;
  iss?: string;
  nbf?: number;
  realm_access?: {
    roles?: unknown;
  };
  resource_access?: Record<string, { roles?: unknown }>;
  role?: unknown;
  roles?: unknown;
  sub?: string;
  [key: string]: unknown;
}

interface StagePilotOidcConfig {
  audience: string;
  issuer: string;
  jwksJson: string;
  jwksUri: string;
  roleClaimPaths: string[];
}

interface OidcJwk {
  alg?: string;
  e?: string;
  kid?: string;
  kty?: string;
  n?: string;
  use?: string;
}

interface ResolvedJwks {
  keys: OidcJwk[];
  source: "config" | "discovery" | "uri";
  uri: string | null;
}

interface VerifiedOperatorIdentity {
  authMode: "oidc" | "token";
  claims?: JwtPayload;
  roles: string[];
  subject: string | null;
}

export interface StagePilotOperatorAuthStatus {
  acceptedHeaders: readonly string[];
  enabled: boolean;
  mode: "hybrid" | "none" | "oidc" | "token";
  oidc: {
    audience: string | null;
    enabled: boolean;
    issuer: string | null;
    jwksSource: "config" | "discovery" | "uri" | null;
    roleClaimPaths: string[];
  };
  requiredRoles: string[];
  roleHeaders: readonly string[];
}

export interface StagePilotOperatorAuthorizationResult {
  authMode: "hybrid" | "none" | "oidc" | "token";
  ok: boolean;
  reason: "invalid-token" | "missing-role" | "missing-token" | null;
  roles: string[];
  subject: string | null;
}

const jwksCache = new Map<
  string,
  {
    expiresAt: number;
    value: ResolvedJwks;
  }
>();

export function getStagePilotOperatorToken(): string {
  return String(process.env.STAGEPILOT_OPERATOR_TOKEN || "").trim();
}

function getStagePilotOidcConfig(): StagePilotOidcConfig {
  return {
    issuer: String(process.env.STAGEPILOT_OPERATOR_OIDC_ISSUER || "").trim(),
    audience: String(
      process.env.STAGEPILOT_OPERATOR_OIDC_AUDIENCE || ""
    ).trim(),
    jwksUri: String(process.env.STAGEPILOT_OPERATOR_OIDC_JWKS_URI || "").trim(),
    jwksJson: String(
      process.env.STAGEPILOT_OPERATOR_OIDC_JWKS_JSON || ""
    ).trim(),
    roleClaimPaths: String(
      process.env.STAGEPILOT_OPERATOR_OIDC_ROLE_CLAIMS ||
        "roles,groups,realm_access.roles,resource_access.{audience}.roles"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function isStagePilotOidcEnabled(): boolean {
  const config = getStagePilotOidcConfig();
  return config.issuer.length > 0 && config.audience.length > 0;
}

function getStagePilotAuthMode(): "hybrid" | "none" | "oidc" | "token" {
  const tokenEnabled = getStagePilotOperatorToken().length > 0;
  const oidcEnabled = isStagePilotOidcEnabled();
  if (tokenEnabled && oidcEnabled) {
    return "hybrid";
  }
  if (tokenEnabled) {
    return "token";
  }
  if (oidcEnabled) {
    return "oidc";
  }
  return "none";
}

export function getStagePilotAllowedRoles(): string[] {
  return String(process.env.STAGEPILOT_OPERATOR_ALLOWED_ROLES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isStagePilotOperatorAuthEnabled(): boolean {
  return getStagePilotAuthMode() !== "none";
}

export function getStagePilotOperatorRoleHeaders(): readonly string[] {
  return ROLE_HEADERS;
}

export function getStagePilotOperatorAuthStatus(): StagePilotOperatorAuthStatus {
  const mode = getStagePilotAuthMode();
  const oidc = getStagePilotOidcConfig();
  let jwksSource: "config" | "discovery" | "uri" | null = null;
  if (oidc.jwksJson) {
    jwksSource = "config";
  } else if (oidc.jwksUri) {
    jwksSource = "uri";
  } else if (oidc.issuer) {
    jwksSource = "discovery";
  }
  return {
    enabled: mode !== "none",
    mode,
    acceptedHeaders: ACCEPTED_HEADERS,
    roleHeaders: ROLE_HEADERS,
    requiredRoles: getStagePilotAllowedRoles(),
    oidc: {
      enabled: isStagePilotOidcEnabled(),
      issuer: oidc.issuer || null,
      audience: oidc.audience || null,
      jwksSource,
      roleClaimPaths: oidc.roleClaimPaths,
    },
  };
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

function readHeaderToken(request: IncomingMessage): string {
  return String(request.headers["x-operator-token"] || "").trim();
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

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function parseJwtPart<T>(segment: string): T {
  return JSON.parse(decodeBase64Url(segment).toString("utf8")) as T;
}

function normalizeAudience(audience: JwtPayload["aud"]): string[] {
  if (Array.isArray(audience)) {
    return audience.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof audience === "string") {
    const trimmed = audience.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function readObjectPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function normalizeRoleValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function readRolesFromClaims(claims: JwtPayload): string[] {
  const config = getStagePilotOidcConfig();
  const paths = Array.from(
    new Set(
      config.roleClaimPaths.flatMap((path) => {
        if (path.includes("{audience}")) {
          return path.replaceAll("{audience}", config.audience);
        }
        return path;
      })
    )
  );

  return Array.from(
    new Set(
      paths.flatMap((path) => normalizeRoleValues(readObjectPath(claims, path)))
    )
  );
}

function selectOidcJwk(keys: OidcJwk[], header: JwtHeader): OidcJwk | null {
  if (header.kid) {
    const matching = keys.find((key) => key.kid === header.kid);
    if (matching) {
      return matching;
    }
  }
  if (keys.length === 1) {
    return keys[0];
  }
  return null;
}

async function resolveOidcJwks(): Promise<ResolvedJwks> {
  const config = getStagePilotOidcConfig();
  const cacheKey = JSON.stringify({
    issuer: config.issuer,
    audience: config.audience,
    jwksJson: config.jwksJson,
    jwksUri: config.jwksUri,
  });
  const cached = jwksCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value: ResolvedJwks;
  if (config.jwksJson) {
    const parsed = JSON.parse(config.jwksJson) as { keys?: OidcJwk[] };
    value = {
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      source: "config",
      uri: null,
    };
  } else {
    let jwksUri = config.jwksUri;
    if (!jwksUri) {
      const discoveryResponse = await fetch(
        `${config.issuer.replace(TRAILING_SLASH_REGEX, "")}/.well-known/openid-configuration`
      );
      if (!discoveryResponse.ok) {
        throw new Error(`OIDC discovery failed (${discoveryResponse.status})`);
      }
      const discoveryPayload = (await discoveryResponse.json()) as {
        jwks_uri?: string;
      };
      jwksUri = String(discoveryPayload.jwks_uri || "").trim();
    }
    if (!jwksUri) {
      throw new Error("missing OIDC jwks_uri");
    }
    const response = await fetch(jwksUri);
    if (!response.ok) {
      throw new Error(`OIDC JWKS fetch failed (${response.status})`);
    }
    const parsed = (await response.json()) as { keys?: OidcJwk[] };
    value = {
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      source: config.jwksUri ? "uri" : "discovery",
      uri: jwksUri,
    };
  }

  jwksCache.set(cacheKey, {
    expiresAt: Date.now() + OIDC_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function verifyOidcToken(
  token: string
): Promise<VerifiedOperatorIdentity | null> {
  const config = getStagePilotOidcConfig();
  if (!(config.issuer && config.audience)) {
    return null;
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseJwtPart<JwtHeader>(encodedHeader);
  if (header.alg !== "RS256") {
    return null;
  }

  const payload = parseJwtPart<JwtPayload>(encodedPayload);
  const { keys } = await resolveOidcJwks();
  const jwk = selectOidcJwk(keys, header);
  if (!jwk) {
    return null;
  }

  const publicKey = createPublicKey({ format: "jwk", key: jwk });
  const valid = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
    publicKey,
    decodeBase64Url(encodedSignature)
  );
  if (!valid) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= now) {
    return null;
  }
  if (typeof payload.nbf === "number" && payload.nbf > now) {
    return null;
  }
  if (String(payload.iss || "").trim() !== config.issuer) {
    return null;
  }
  if (!normalizeAudience(payload.aud).includes(config.audience)) {
    return null;
  }

  return {
    authMode: "oidc",
    claims: payload,
    roles: readRolesFromClaims(payload),
    subject: String(payload.sub || payload.email || "").trim() || null,
  };
}

function hasRequiredRole(presentedRoles: string[]): boolean {
  const allowedRoles = getStagePilotAllowedRoles();
  if (allowedRoles.length === 0) {
    return true;
  }
  return presentedRoles.some((role) => allowedRoles.includes(role));
}

function buildTokenIdentity(
  request: IncomingMessage
): VerifiedOperatorIdentity | null {
  const expected = getStagePilotOperatorToken();
  if (!expected) {
    return null;
  }
  const headerToken = readHeaderToken(request);
  const bearerToken =
    typeof request.headers.authorization === "string"
      ? readBearerToken(request.headers.authorization)
      : "";
  if (headerToken !== expected && bearerToken !== expected) {
    return null;
  }
  return {
    authMode: "token",
    roles: readPresentedRoles(request),
    subject: "token-operator",
  };
}

export async function validateStagePilotOperatorAccess(
  request: IncomingMessage
): Promise<StagePilotOperatorAuthorizationResult> {
  const mode = getStagePilotAuthMode();
  if (mode === "none") {
    return {
      ok: true,
      reason: null,
      authMode: "none",
      roles: [],
      subject: null,
    };
  }

  const tokenIdentity = buildTokenIdentity(request);
  let identity = tokenIdentity;
  if (!identity && isStagePilotOidcEnabled()) {
    const bearerToken =
      typeof request.headers.authorization === "string"
        ? readBearerToken(request.headers.authorization)
        : "";
    if (bearerToken) {
      identity = await verifyOidcToken(bearerToken);
    }
  }

  if (!identity) {
    return {
      ok: false,
      reason:
        readHeaderToken(request) ||
        (typeof request.headers.authorization === "string"
          ? readBearerToken(request.headers.authorization)
          : "")
          ? "invalid-token"
          : "missing-token",
      authMode: mode,
      roles: [],
      subject: null,
    };
  }

  const presentedRoles = Array.from(
    new Set([...identity.roles, ...readPresentedRoles(request)])
  );
  if (!hasRequiredRole(presentedRoles)) {
    return {
      ok: false,
      reason: "missing-role",
      authMode: identity.authMode,
      roles: presentedRoles,
      subject: identity.subject,
    };
  }

  return {
    ok: true,
    reason: null,
    authMode: identity.authMode,
    roles: presentedRoles,
    subject: identity.subject,
  };
}
