/**
 * OpenTelemetry metrics for stage-pilot.
 *
 * Opt-in: metrics are only recorded when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * When the endpoint is not configured the instruments still exist but produce
 * no-op recordings, so callers never need to guard with conditionals.
 */

import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("stage-pilot");

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * Total number of tool calls processed.
 * Labels: protocol (e.g. "hermes", "morphXml"), status ("success" | "error").
 */
export const toolCallsTotal = meter.createCounter("tool_calls_total", {
  description: "Total tool calls processed",
  unit: "1",
});

/**
 * Total number of tool-call retries (e.g. Ralph-loop attempts beyond the first).
 */
export const toolCallRetriesTotal = meter.createCounter(
  "tool_call_retries_total",
  {
    description: "Total tool-call retry attempts",
    unit: "1",
  }
);

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------

/**
 * Duration of tool-call parse operations in milliseconds.
 */
export const toolCallParseDuration = meter.createHistogram(
  "tool_call_parse_duration_ms",
  {
    description: "Tool-call parse duration in milliseconds",
    unit: "ms",
  }
);

// ---------------------------------------------------------------------------
// Gauges
// ---------------------------------------------------------------------------

/**
 * Latest benchmark success rate (0-1 scale).
 */
export const benchmarkSuccessRate = meter.createGauge(
  "benchmark_success_rate",
  {
    description: "Latest benchmark success rate (0.0 to 1.0)",
    unit: "1",
  }
);
