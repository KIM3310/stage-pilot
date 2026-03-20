/**
 * Prometheus-compatible metrics endpoint for StagePilot.
 *
 * Exposes /v1/metrics in Prometheus text exposition format.
 * Tracks benchmark run counts, parse success/failure rates,
 * and latency histograms per protocol.
 *
 * Usage:
 *   import { metricsRegistry, recordParseAttempt, recordBenchmarkRun } from "./prometheus-metrics";
 *   recordParseAttempt("hermes", true, 1.23);
 *   const output = metricsRegistry.serialize();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistogramBucket {
  bound: number;
  count: number;
}

interface HistogramState {
  buckets: HistogramBucket[];
  count: number;
  sum: number;
}

interface CounterState {
  labels: Record<string, string>;
  value: number;
}

interface GaugeState {
  labels: Record<string, string>;
  value: number;
}

// ---------------------------------------------------------------------------
// Histogram bucket boundaries (latency in milliseconds)
// ---------------------------------------------------------------------------

const LATENCY_BUCKETS = [
  0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000,
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class MetricsRegistry {
  private readonly counters = new Map<string, CounterState[]>();
  private readonly gauges = new Map<string, GaugeState[]>();
  private readonly histograms = new Map<string, Map<string, HistogramState>>();
  private readonly help = new Map<string, string>();
  private readonly types = new Map<string, "counter" | "gauge" | "histogram">();

  registerCounter(name: string, help: string): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, []);
      this.help.set(name, help);
      this.types.set(name, "counter");
    }
  }

  registerGauge(name: string, help: string): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
      this.help.set(name, help);
      this.types.set(name, "gauge");
    }
  }

  registerHistogram(name: string, help: string): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
      this.help.set(name, help);
      this.types.set(name, "histogram");
    }
  }

  incrementCounter(
    name: string,
    labels: Record<string, string>,
    value = 1
  ): void {
    const states = this.counters.get(name);
    if (!states) {
      return;
    }

    const key = serializeLabels(labels);
    const existing = states.find((s) => serializeLabels(s.labels) === key);
    if (existing) {
      existing.value += value;
    } else {
      states.push({ labels, value });
    }
  }

  setGauge(name: string, labels: Record<string, string>, value: number): void {
    const states = this.gauges.get(name);
    if (!states) {
      return;
    }

    const key = serializeLabels(labels);
    const existing = states.find((s) => serializeLabels(s.labels) === key);
    if (existing) {
      existing.value = value;
    } else {
      states.push({ labels, value });
    }
  }

  observeHistogram(name: string, labelKey: string, value: number): void {
    const histMap = this.histograms.get(name);
    if (!histMap) {
      return;
    }

    let state = histMap.get(labelKey);
    if (!state) {
      state = {
        buckets: LATENCY_BUCKETS.map((bound) => ({ bound, count: 0 })),
        count: 0,
        sum: 0,
      };
      histMap.set(labelKey, state);
    }

    state.count++;
    state.sum += value;
    for (const bucket of state.buckets) {
      if (value <= bucket.bound) {
        bucket.count++;
      }
    }
  }

  /**
   * Serialize all metrics in Prometheus text exposition format.
   */
  serialize(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, states] of this.counters) {
      lines.push(`# HELP ${name} ${this.help.get(name) ?? ""}`);
      lines.push(`# TYPE ${name} counter`);
      for (const state of states) {
        const labelStr = formatLabels(state.labels);
        lines.push(`${name}${labelStr} ${state.value}`);
      }
    }

    // Gauges
    for (const [name, states] of this.gauges) {
      lines.push(`# HELP ${name} ${this.help.get(name) ?? ""}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const state of states) {
        const labelStr = formatLabels(state.labels);
        lines.push(`${name}${labelStr} ${state.value}`);
      }
    }

    // Histograms
    for (const [name, histMap] of this.histograms) {
      lines.push(`# HELP ${name} ${this.help.get(name) ?? ""}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [labelKey, state] of histMap) {
        for (const bucket of state.buckets) {
          lines.push(
            `${name}_bucket{protocol="${labelKey}",le="${bucket.bound}"} ${bucket.count}`
          );
        }
        lines.push(
          `${name}_bucket{protocol="${labelKey}",le="+Inf"} ${state.count}`
        );
        lines.push(`${name}_sum{protocol="${labelKey}"} ${state.sum}`);
        lines.push(`${name}_count{protocol="${labelKey}"} ${state.count}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }

  /** Reset all metrics (useful for testing). */
  reset(): void {
    for (const states of this.counters.values()) {
      states.length = 0;
    }
    for (const states of this.gauges.values()) {
      states.length = 0;
    }
    for (const histMap of this.histograms.values()) {
      histMap.clear();
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Global registry instance
// ---------------------------------------------------------------------------

export const metricsRegistry = new MetricsRegistry();

// Register standard StagePilot metrics
metricsRegistry.registerCounter(
  "stagepilot_benchmark_runs_total",
  "Total benchmark runs executed"
);
metricsRegistry.registerCounter(
  "stagepilot_parse_attempts_total",
  "Total tool-call parse attempts"
);
metricsRegistry.registerCounter(
  "stagepilot_parse_successes_total",
  "Successful tool-call parse attempts"
);
metricsRegistry.registerCounter(
  "stagepilot_parse_failures_total",
  "Failed tool-call parse attempts"
);
metricsRegistry.registerGauge(
  "stagepilot_benchmark_success_rate",
  "Latest benchmark success rate (0-1)"
);
metricsRegistry.registerGauge(
  "stagepilot_uptime_seconds",
  "Process uptime in seconds"
);
metricsRegistry.registerHistogram(
  "stagepilot_parse_latency_ms",
  "Tool-call parse latency in milliseconds"
);
metricsRegistry.registerHistogram(
  "stagepilot_request_latency_ms",
  "HTTP request latency in milliseconds"
);

const processStartTime = Date.now();

// ---------------------------------------------------------------------------
// Convenience recording functions
// ---------------------------------------------------------------------------

/**
 * Record a tool-call parse attempt.
 */
export function recordParseAttempt(
  protocol: string,
  success: boolean,
  latencyMs: number
): void {
  metricsRegistry.incrementCounter("stagepilot_parse_attempts_total", {
    protocol,
  });

  if (success) {
    metricsRegistry.incrementCounter("stagepilot_parse_successes_total", {
      protocol,
    });
  } else {
    metricsRegistry.incrementCounter("stagepilot_parse_failures_total", {
      protocol,
    });
  }

  metricsRegistry.observeHistogram(
    "stagepilot_parse_latency_ms",
    protocol,
    latencyMs
  );
}

/**
 * Record a benchmark run completion.
 */
export function recordBenchmarkRun(
  strategy: string,
  successRate: number
): void {
  metricsRegistry.incrementCounter("stagepilot_benchmark_runs_total", {
    strategy,
  });
  metricsRegistry.setGauge(
    "stagepilot_benchmark_success_rate",
    { strategy },
    successRate
  );
}

/**
 * Record an HTTP request latency.
 */
export function recordRequestLatency(route: string, latencyMs: number): void {
  metricsRegistry.observeHistogram(
    "stagepilot_request_latency_ms",
    route,
    latencyMs
  );
}

/**
 * Generate the Prometheus metrics response body.
 * Includes uptime gauge update.
 */
export function serializeMetrics(): string {
  // Update uptime before serializing
  metricsRegistry.setGauge(
    "stagepilot_uptime_seconds",
    {},
    Math.floor((Date.now() - processStartTime) / 1000)
  );

  return metricsRegistry.serialize();
}

/**
 * Content-Type header for Prometheus exposition format.
 */
export const PROMETHEUS_CONTENT_TYPE =
  "text/plain; version=0.0.4; charset=utf-8";
