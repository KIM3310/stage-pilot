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

import { trace, context, SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";

let _initialized = false;
let _sdkInstance: { shutdown: () => Promise<void> } | undefined;

const SERVICE_NAME = "stage-pilot";
const TRACER_NAME = "stage-pilot";

/**
 * Returns true if OTEL is configured via environment variable.
 */
export function isOtelEnabled(): boolean {
  return !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
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
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
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
export const tracer: Tracer = trace.getTracer(TRACER_NAME);

// ---------------------------------------------------------------------------
// Span helpers for common stage-pilot operations
// ---------------------------------------------------------------------------

/**
 * Wrap an async function in a "tool-call-parse" span.
 */
export async function withToolCallParseSpan<T>(
  protocol: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan("tool-call.parse", async (span) => {
    span.setAttribute("tool_call.protocol", protocol);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async function in a "protocol-detection" span.
 */
export async function withProtocolDetectionSpan<T>(
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan("protocol.detect", async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async function in a "retry-loop" span (e.g. Ralph loop).
 */
export async function withRetryLoopSpan<T>(
  maxAttempts: number,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan("retry.loop", async (span) => {
    span.setAttribute("retry.max_attempts", maxAttempts);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap an async function in a "benchmark-run" span.
 */
export async function withBenchmarkRunSpan<T>(
  strategy: string,
  caseCount: number,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan("benchmark.run", async (span) => {
    span.setAttribute("benchmark.strategy", strategy);
    span.setAttribute("benchmark.case_count", caseCount);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

export { context, SpanStatusCode, trace };
export type { Span };
