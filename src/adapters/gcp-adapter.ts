/**
 * GCP cloud adapter for StagePilot.
 *
 * Provides Google Cloud Storage for benchmark artifacts and BigQuery for
 * benchmark analytics.
 * Env-var gated: only activates when GCP_PROJECT_ID and
 * GOOGLE_APPLICATION_CREDENTIALS are set.
 *
 * Usage:
 *   import { GcpAdapter } from "./adapters/gcp-adapter";
 *   const gcp = GcpAdapter.fromEnv();
 *   if (gcp) {
 *     await gcp.uploadBenchmarkArtifact("run-001", jsonPayload);
 *     await gcp.insertBenchmarkRow({ ... });
 *   }
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GcpAdapterConfig {
  bigQueryDataset: string;
  bigQueryTable: string;
  credentials: GcpServiceAccountCredentials | null;
  projectId: string;
  storageBucket: string;
}

export interface GcpServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri: string;
}

export interface GcsUploadResult {
  bucket: string;
  name: string;
  url: string;
}

export interface BigQueryBenchmarkRow {
  avg_attempts: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  run_id: string;
  strategy: string;
  success_rate: number;
  timestamp: string;
  total_cases: number;
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let _tokenCache: CachedToken | null = null;

/**
 * Create a signed JWT for service account authentication.
 */
function createServiceAccountJwt(
  credentials: GcpServiceAccountCredentials,
  scopes: string[]
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: scopes.join(" "),
      aud: credentials.token_uri,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");

  const signInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer.sign(credentials.private_key, "base64url");

  return `${signInput}.${signature}`;
}

/**
 * Exchange a signed JWT for an OAuth2 access token.
 */
async function getAccessToken(
  credentials: GcpServiceAccountCredentials
): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.accessToken;
  }

  const jwt = createServiceAccountJwt(credentials, [
    "https://www.googleapis.com/auth/devstorage.read_write",
    "https://www.googleapis.com/auth/bigquery.insertdata",
    "https://www.googleapis.com/auth/bigquery",
  ]);

  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GCP token exchange failed (${response.status}): ${text.slice(0, 500)}`
    );
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  _tokenCache = {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };

  return _tokenCache.accessToken;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GcpAdapter {
  private readonly config: GcpAdapterConfig;

  constructor(config: GcpAdapterConfig) {
    this.config = config;
  }

  /**
   * Create an adapter from environment variables.
   * Returns null if GCP_PROJECT_ID is not set.
   */
  static fromEnv(): GcpAdapter | null {
    const projectId = process.env.GCP_PROJECT_ID?.trim();

    if (!projectId) {
      return null;
    }

    let credentials: GcpServiceAccountCredentials | null = null;
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

    if (credPath) {
      try {
        const raw = readFileSync(credPath, "utf-8");
        const parsed = JSON.parse(raw) as GcpServiceAccountCredentials;
        if (parsed.client_email && parsed.private_key && parsed.token_uri) {
          credentials = parsed;
        }
      } catch {
        // Credentials file missing or malformed — adapter will operate in
        // metadata-server mode (e.g. on Cloud Run / GKE where ambient
        // credentials are available).
      }
    }

    return new GcpAdapter({
      projectId,
      credentials,
      storageBucket:
        process.env.GCP_STORAGE_BUCKET?.trim() ||
        `${projectId}-stagepilot-artifacts`,
      bigQueryDataset: process.env.GCP_BIGQUERY_DATASET?.trim() || "stagepilot",
      bigQueryTable: process.env.GCP_BIGQUERY_TABLE?.trim() || "benchmark_runs",
    });
  }

  /** Check whether the adapter is configured and usable. */
  get enabled(): boolean {
    return !!this.config.projectId;
  }

  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------

  /**
   * Obtain a bearer token. Uses service account credentials when available,
   * otherwise falls back to the GCE metadata server (Cloud Run, GKE).
   */
  private async getToken(): Promise<string> {
    if (this.config.credentials) {
      return getAccessToken(this.config.credentials);
    }

    // Metadata server fallback (Cloud Run / GKE)
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );

    if (!response.ok) {
      throw new Error(`GCP metadata token fetch failed (${response.status})`);
    }

    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }

  // -------------------------------------------------------------------------
  // GCS — Benchmark artifact storage
  // -------------------------------------------------------------------------

  /**
   * Upload a benchmark artifact to Google Cloud Storage.
   *
   * Objects are stored under the path:
   *   benchmarks/{runId}/{filename}
   */
  async uploadBenchmarkArtifact(
    runId: string,
    payload: Record<string, unknown>,
    filename = "report.json"
  ): Promise<GcsUploadResult> {
    const name = `benchmarks/${runId}/${filename}`;
    const bucket = this.config.storageBucket;
    const body = JSON.stringify(payload, null, 2);
    const token = await this.getToken();

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(name)}`;

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `GCS upload failed (${response.status}): ${text.slice(0, 500)}`
      );
    }

    return {
      bucket,
      name,
      url: `https://storage.googleapis.com/${bucket}/${name}`,
    };
  }

  /**
   * List benchmark artifacts under a given run ID prefix.
   */
  async listBenchmarkArtifacts(
    runId: string
  ): Promise<{ name: string; size: string }[]> {
    const prefix = `benchmarks/${runId}/`;
    const bucket = this.config.storageBucket;
    const token = await this.getToken();

    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?prefix=${encodeURIComponent(prefix)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`GCS list failed (${response.status})`);
    }

    const body = (await response.json()) as {
      items?: { name: string; size: string }[];
    };

    return (body.items ?? []).map((item) => ({
      name: item.name,
      size: item.size,
    }));
  }

  // -------------------------------------------------------------------------
  // BigQuery — Benchmark analytics
  // -------------------------------------------------------------------------

  /**
   * Insert a benchmark run row into BigQuery for analytics.
   */
  async insertBenchmarkRow(row: BigQueryBenchmarkRow): Promise<void> {
    await this.insertBenchmarkRows([row]);
  }

  /**
   * Insert multiple benchmark run rows into BigQuery (streaming insert).
   */
  async insertBenchmarkRows(rows: BigQueryBenchmarkRow[]): Promise<void> {
    const token = await this.getToken();
    const { projectId, bigQueryDataset, bigQueryTable } = this.config;

    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${bigQueryDataset}/tables/${bigQueryTable}/insertAll`;

    const body = JSON.stringify({
      rows: rows.map((row) => ({
        insertId: `${row.run_id}-${row.strategy}`,
        json: row,
      })),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `BigQuery insertAll failed (${response.status}): ${text.slice(0, 500)}`
      );
    }

    const result = (await response.json()) as {
      insertErrors?: unknown[];
    };

    if (result.insertErrors && result.insertErrors.length > 0) {
      throw new Error(
        `BigQuery insert had ${result.insertErrors.length} error(s): ${JSON.stringify(result.insertErrors).slice(0, 500)}`
      );
    }
  }

  /**
   * Query benchmark analytics from BigQuery.
   * Returns the latest N runs per strategy for dashboard/trend display.
   */
  async queryBenchmarkTrends(limit = 50): Promise<Record<string, unknown>[]> {
    const token = await this.getToken();
    const { projectId, bigQueryDataset, bigQueryTable } = this.config;

    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;

    const query = `
      SELECT run_id, strategy, success_rate, avg_latency_ms, p95_latency_ms,
             total_cases, avg_attempts, timestamp
      FROM \`${projectId}.${bigQueryDataset}.${bigQueryTable}\`
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, useLegacySql: false }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `BigQuery query failed (${response.status}): ${text.slice(0, 500)}`
      );
    }

    const body = (await response.json()) as {
      rows?: { f: { v: string }[] }[];
      schema?: { fields: { name: string }[] };
    };

    if (!(body.rows && body.schema)) {
      return [];
    }

    const fields = body.schema.fields.map((f) => f.name);
    return body.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < fields.length; i++) {
        obj[fields[i]] = row.f[i]?.v;
      }
      return obj;
    });
  }

  /**
   * Publish a complete benchmark report to both GCS and BigQuery.
   */
  async publishBenchmarkReport(
    runId: string,
    report: Record<string, unknown>,
    strategies: {
      avg_attempts: number;
      avg_latency_ms: number;
      p95_latency_ms: number;
      strategy: string;
      success_rate: number;
      total_cases: number;
    }[]
  ): Promise<{ bigQueryRows: number; gcsUrl: string }> {
    const gcsResult = await this.uploadBenchmarkArtifact(runId, report);

    const timestamp = new Date().toISOString();
    const rows: BigQueryBenchmarkRow[] = strategies.map((s) => ({
      run_id: runId,
      strategy: s.strategy,
      success_rate: s.success_rate,
      avg_latency_ms: s.avg_latency_ms,
      p95_latency_ms: s.p95_latency_ms,
      total_cases: s.total_cases,
      avg_attempts: s.avg_attempts,
      timestamp,
    }));

    await this.insertBenchmarkRows(rows);

    return { gcsUrl: gcsResult.url, bigQueryRows: rows.length };
  }
}
