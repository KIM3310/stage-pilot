/**
 * OpenTelemetry instrumentation for stage-pilot.
 *
 * Opt-in: telemetry is only active when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *
 * Usage:
 *   import { initTelemetry, tracer } from "./telemetry";
 *   initTelemetry();  // call once at startup
 *   const span = tracer.startSpan("my-operation");
 */

import {
  SpanStatusCode as OtelSpanStatusCode,
  context as otelContext,
  trace as otelTrace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";

let _initialized = false;
let _sdkInstance: { shutdown: () => Promise<void> } | undefined;

const SERVICE_NAME = "stage-pilot";
const TRACER_NAME = "stage-pilot";
const OTEL_TRACE_PATH = "/v1/traces";
const TRAILING_SLASHES_REGEX = /\/+$/;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Resolve the OTLP traces exporter URL from standard env vars.
 *
 * OTEL_EXPORTER_OTLP_TRACES_ENDPOINT wins when both are set. When only the
 * generic OTLP endpoint is present, append `/v1/traces` unless the caller
 * already provided the full traces path.
 */
export function resolveTraceExporterUrl(
  rawValue = readEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") ??
    readEnv("OTEL_EXPORTER_OTLP_ENDPOINT")
): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  const normalized = rawValue.replace(TRAILING_SLASHES_REGEX, "");
  if (normalized.endsWith(OTEL_TRACE_PATH)) {
    return normalized;
  }

  return `${normalized}${OTEL_TRACE_PATH}`;
}

/**
 * Parse OTLP exporter headers from a comma-separated env var.
 *
 * Example:
 *   authorization=Bearer abc,dd-api-key=xyz
 */
export function parseOtelHeaders(
  rawValue = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? ""
): Record<string, string> {
  return rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) {
        return headers;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key && value) {
        headers[key] = value;
      }
      return headers;
    }, {});
}

export function getOtelConfigStatus(): {
  enabled: boolean;
  exporterUrl: string | null;
  headerKeys: string[];
} {
  const exporterUrl = resolveTraceExporterUrl();
  return {
    enabled: Boolean(exporterUrl),
    exporterUrl: exporterUrl ?? null,
    headerKeys: Object.keys(parseOtelHeaders()),
  };
}

/**
 * Returns true if OTEL is configured via environment variable.
 */
export function isOtelEnabled(): boolean {
  return Boolean(resolveTraceExporterUrl());
}

/**
 * Initialize the OpenTelemetry SDK.
 * No-op if OTEL_EXPORTER_OTLP_ENDPOINT is not set.
 */
export async function initTelemetry(): Promise<void> {
  if (_initialized || !isOtelEnabled()) {
    return;
  }
  _initialized = true;

  const traceUrl = resolveTraceExporterUrl();
  if (!traceUrl) {
    _initialized = false;
    return;
  }

  // Dynamic imports so the SDK packages are only loaded when telemetry is active.
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import(
    "@opentelemetry/exporter-trace-otlp-http"
  );
  const { getNodeAutoInstrumentations } = await import(
    "@opentelemetry/auto-instrumentations-node"
  );
  const { Resource } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } = await import(
    "@opentelemetry/semantic-conventions"
  );

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
  });

  const traceExporter = new OTLPTraceExporter({
    url: traceUrl,
    headers: parseOtelHeaders(),
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  _sdkInstance = sdk;
}

/**
 * Gracefully shut down the SDK (flushes pending spans).
 */
export async function shutdownTelemetry(): Promise<void> {
  if (_sdkInstance) {
    await _sdkInstance.shutdown();
    _sdkInstance = undefined;
    _initialized = false;
  }
}

/**
 * Convenience tracer instance for manual span creation.
 */
export const tracer: Tracer = otelTrace.getTracer(TRACER_NAME);

// ---------------------------------------------------------------------------
// Span helpers for common stage-pilot operations
// ---------------------------------------------------------------------------

/**
 * Wrap an async function in a "tool-call-parse" span.
 */
export function withToolCallParseSpan<T>(
  protocol: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan("tool-call.parse", async (span) => {
    span.setAttribute("tool_call.protocol", protocol);
    try {
      const result = await fn(span);
      span.setStatus({ code: OtelSpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: OtelSpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async function in a "protocol-detection" span.
 */
export function withProtocolDetectionSpan<T>(
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan("protocol.detect", async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: OtelSpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: OtelSpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async function in a "retry-loop" span (e.g. Ralph loop).
 */
export function withRetryLoopSpan<T>(
  maxAttempts: number,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan("retry.loop", async (span) => {
    span.setAttribute("retry.max_attempts", maxAttempts);
    try {
      const result = await fn(span);
      span.setStatus({ code: OtelSpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: OtelSpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async function in a "benchmark-run" span.
 */
export function withBenchmarkRunSpan<T>(
  strategy: string,
  caseCount: number,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan("benchmark.run", async (span) => {
    span.setAttribute("benchmark.strategy", strategy);
    span.setAttribute("benchmark.case_count", caseCount);
    try {
      const result = await fn(span);
      span.setStatus({ code: OtelSpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: OtelSpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

export const context = otelContext;
export const SpanStatusCode = OtelSpanStatusCode;
export const trace = otelTrace;
export type { Span } from "@opentelemetry/api";
