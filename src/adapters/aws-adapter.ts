/**
 * AWS cloud adapter for StagePilot.
 *
 * Provides S3 artifact storage and CloudWatch metrics integration.
 * Env-var gated: only activates when AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.
 *
 * Usage:
 *   import { AwsAdapter } from "./adapters/aws-adapter";
 *   const aws = AwsAdapter.fromEnv();
 *   if (aws) {
 *     await aws.uploadBenchmarkArtifact("run-001", jsonPayload);
 *     await aws.publishMetric("benchmark.success_rate", 0.9, "None");
 *   }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AwsAdapterConfig {
  accessKeyId: string;
  cloudWatchNamespace: string;
  region: string;
  s3Bucket: string;
  secretAccessKey: string;
}

export interface CloudWatchMetricDatum {
  dimensions?: Record<string, string>;
  metricName: string;
  timestamp?: Date;
  unit: CloudWatchUnit;
  value: number;
}

export type CloudWatchUnit =
  | "Count"
  | "Milliseconds"
  | "None"
  | "Percent"
  | "Seconds";

export interface S3PutResult {
  bucket: string;
  key: string;
  url: string;
}

const ISO_MILLIS_SUFFIX_REGEX = /\.\d+Z$/;
const S3_CONTENTS_REGEX =
  /<Contents>[\s\S]*?<Key>(.*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer, data: string): Buffer {
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function toAmzDate(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(ISO_MILLIS_SUFFIX_REGEX, "Z");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * Minimal AWS Signature V4 signer.
 * Avoids pulling in the full AWS SDK for two focused API calls.
 */
function signAwsRequest(opts: {
  accessKeyId: string;
  body: string;
  headers: Record<string, string>;
  host: string;
  method: string;
  path: string;
  region: string;
  secretAccessKey: string;
  service: string;
}): Record<string, string> {
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);

  const headers: Record<string, string> = {
    ...opts.headers,
    host: opts.host,
    "x-amz-date": amzDate,
  };

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = `${signedHeaderKeys
    .map(
      (k) =>
        `${k}:${headers[k] ?? (headers as Record<string, string>)[k.charAt(0).toUpperCase() + k.slice(1)] ?? ""}`
    )
    .join("\n")}\n`;

  const payloadHash = sha256Hex(opts.body);

  const canonicalRequest = [
    opts.method,
    opts.path,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(
    Buffer.from(`AWS4${opts.secretAccessKey}`, "utf8"),
    dateStamp
  );
  const kRegion = hmacSha256(kDate, opts.region);
  const kService = hmacSha256(kRegion, opts.service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    authorization,
    "x-amz-content-sha256": payloadHash,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class AwsAdapter {
  private readonly config: AwsAdapterConfig;

  constructor(config: AwsAdapterConfig) {
    this.config = config;
  }

  /**
   * Create an adapter from environment variables.
   * Returns null if required AWS credentials are not configured.
   */
  static fromEnv(): AwsAdapter | null {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

    if (!(accessKeyId && secretAccessKey)) {
      return null;
    }

    return new AwsAdapter({
      accessKeyId,
      secretAccessKey,
      region: process.env.AWS_REGION?.trim() || "us-east-1",
      s3Bucket:
        process.env.AWS_S3_BENCHMARK_BUCKET?.trim() ||
        "stagepilot-benchmark-artifacts",
      cloudWatchNamespace:
        process.env.AWS_CLOUDWATCH_NAMESPACE?.trim() || "StagePilot",
    });
  }

  /** Check whether the adapter is configured and usable. */
  get enabled(): boolean {
    return !!(this.config.accessKeyId && this.config.secretAccessKey);
  }

  // -------------------------------------------------------------------------
  // S3 — Benchmark artifact storage
  // -------------------------------------------------------------------------

  /**
   * Upload a benchmark artifact to S3.
   *
   * Objects are stored under the key pattern:
   *   benchmarks/{runId}/{filename}
   */
  async uploadBenchmarkArtifact(
    runId: string,
    payload: Record<string, unknown>,
    filename = "report.json"
  ): Promise<S3PutResult> {
    const key = `benchmarks/${runId}/${filename}`;
    const body = JSON.stringify(payload, null, 2);
    const bucket = this.config.s3Bucket;
    const host = `${bucket}.s3.${this.config.region}.amazonaws.com`;

    const headers = signAwsRequest({
      method: "PUT",
      path: `/${key}`,
      host,
      service: "s3",
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      headers: { "content-type": "application/json" },
      body,
    });

    const url = `https://${host}/${key}`;

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `S3 PUT failed (${response.status}): ${text.slice(0, 500)}`
      );
    }

    return { bucket, key, url };
  }

  /**
   * List benchmark artifacts for a given run ID.
   */
  async listBenchmarkArtifacts(
    runId: string
  ): Promise<{ key: string; size: number }[]> {
    const prefix = `benchmarks/${runId}/`;
    const bucket = this.config.s3Bucket;
    const host = `${bucket}.s3.${this.config.region}.amazonaws.com`;
    const path = `/?list-type=2&prefix=${encodeURIComponent(prefix)}`;

    const headers = signAwsRequest({
      method: "GET",
      path,
      host,
      service: "s3",
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      headers: {},
      body: "",
    });

    const response = await fetch(`https://${host}${path}`, { headers });

    if (!response.ok) {
      throw new Error(`S3 LIST failed (${response.status})`);
    }

    // Minimal XML parse for Contents/Key and Contents/Size
    const xml = await response.text();
    const items: { key: string; size: number }[] = [];
    let match: RegExpExecArray | null;
    S3_CONTENTS_REGEX.lastIndex = 0;
    match = S3_CONTENTS_REGEX.exec(xml);
    while (match) {
      items.push({ key: match[1], size: Number(match[2]) });
      match = S3_CONTENTS_REGEX.exec(xml);
    }

    return items;
  }

  // -------------------------------------------------------------------------
  // CloudWatch — Metrics publishing
  // -------------------------------------------------------------------------

  /**
   * Publish a single metric datum to CloudWatch.
   */
  async publishMetric(
    metricName: string,
    value: number,
    unit: CloudWatchUnit,
    dimensions?: Record<string, string>
  ): Promise<void> {
    await this.publishMetrics([
      { metricName, value, unit, dimensions, timestamp: new Date() },
    ]);
  }

  /**
   * Publish a batch of metric data to CloudWatch.
   */
  async publishMetrics(data: CloudWatchMetricDatum[]): Promise<void> {
    const host = `monitoring.${this.config.region}.amazonaws.com`;
    const params = new URLSearchParams();
    params.set("Action", "PutMetricData");
    params.set("Namespace", this.config.cloudWatchNamespace);
    params.set("Version", "2010-08-01");

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const prefix = `MetricData.member.${i + 1}`;
      params.set(`${prefix}.MetricName`, d.metricName);
      params.set(`${prefix}.Value`, String(d.value));
      params.set(`${prefix}.Unit`, d.unit);
      if (d.timestamp) {
        params.set(`${prefix}.Timestamp`, d.timestamp.toISOString());
      }

      if (d.dimensions) {
        let dimIdx = 1;
        for (const [name, val] of Object.entries(d.dimensions)) {
          params.set(`${prefix}.Dimensions.member.${dimIdx}.Name`, name);
          params.set(`${prefix}.Dimensions.member.${dimIdx}.Value`, val);
          dimIdx++;
        }
      }
    }

    const body = params.toString();

    const headers = signAwsRequest({
      method: "POST",
      path: "/",
      host,
      service: "monitoring",
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const response = await fetch(`https://${host}/`, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `CloudWatch PutMetricData failed (${response.status}): ${text.slice(0, 500)}`
      );
    }
  }

  /**
   * Publish standard StagePilot benchmark metrics to CloudWatch.
   */
  async publishBenchmarkMetrics(report: {
    avgLatencyMs: number;
    p95LatencyMs: number;
    strategy: string;
    successRate: number;
    totalCases: number;
  }): Promise<void> {
    const dims = { Strategy: report.strategy };

    await this.publishMetrics([
      {
        metricName: "BenchmarkSuccessRate",
        value: report.successRate,
        unit: "Percent",
        dimensions: dims,
      },
      {
        metricName: "BenchmarkTotalCases",
        value: report.totalCases,
        unit: "Count",
        dimensions: dims,
      },
      {
        metricName: "BenchmarkAvgLatencyMs",
        value: report.avgLatencyMs,
        unit: "Milliseconds",
        dimensions: dims,
      },
      {
        metricName: "BenchmarkP95LatencyMs",
        value: report.p95LatencyMs,
        unit: "Milliseconds",
        dimensions: dims,
      },
    ]);
  }
}
