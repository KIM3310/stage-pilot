/**
 * Multi-cloud adapter index.
 *
 * Provides a unified entry point for cloud-provider integrations.
 * Each adapter is env-var gated and returns null when not configured.
 */

export { AwsAdapter } from "./aws-adapter";
export type {
  AwsAdapterConfig,
  CloudWatchMetricDatum,
  CloudWatchUnit,
  S3PutResult,
} from "./aws-adapter";

export { GcpAdapter } from "./gcp-adapter";
export type {
  BigQueryBenchmarkRow,
  GcpAdapterConfig,
  GcpServiceAccountCredentials,
  GcsUploadResult,
} from "./gcp-adapter";

/**
 * Initialize all available cloud adapters from environment variables.
 * Returns only adapters whose required credentials are present.
 */
export function initCloudAdapters(): {
  aws: InstanceType<typeof import("./aws-adapter").AwsAdapter> | null;
  gcp: InstanceType<typeof import("./gcp-adapter").GcpAdapter> | null;
} {
  const { AwsAdapter: Aws } = require("./aws-adapter") as typeof import("./aws-adapter");
  const { GcpAdapter: Gcp } = require("./gcp-adapter") as typeof import("./gcp-adapter");

  return {
    aws: Aws.fromEnv(),
    gcp: Gcp.fromEnv(),
  };
}
