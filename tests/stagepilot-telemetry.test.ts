import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getOtelConfigStatus,
  isOtelEnabled,
  parseOtelHeaders,
  resolveTraceExporterUrl,
} from "../src/telemetry/index.ts";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("stage-pilot telemetry configuration", () => {
  it("appends the traces path when only the base OTLP endpoint is configured", () => {
    expect(resolveTraceExporterUrl("http://127.0.0.1:4318")).toBe(
      "http://127.0.0.1:4318/v1/traces"
    );
    expect(resolveTraceExporterUrl("http://127.0.0.1:4318/")).toBe(
      "http://127.0.0.1:4318/v1/traces"
    );
  });

  it("preserves an explicit traces endpoint", () => {
    expect(
      resolveTraceExporterUrl("https://collector.internal/v1/traces")
    ).toBe("https://collector.internal/v1/traces");
  });

  it("parses OTLP headers from a comma-separated env value", () => {
    expect(
      parseOtelHeaders(
        "authorization=Bearer abc, dd-api-key=12345, malformed, empty="
      )
    ).toEqual({
      authorization: "Bearer abc",
      "dd-api-key": "12345",
    });
  });

  it("reports effective OTEL config with traces endpoint precedence", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT =
      "https://proxy.example/v1/traces";
    process.env.OTEL_EXPORTER_OTLP_HEADERS = "dd-api-key=abc123";

    expect(isOtelEnabled()).toBe(true);
    expect(getOtelConfigStatus()).toEqual({
      enabled: true,
      exporterUrl: "https://proxy.example/v1/traces",
      headerKeys: ["dd-api-key"],
    });
  });
});
