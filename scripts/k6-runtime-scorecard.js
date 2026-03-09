import { check, sleep } from "k6";
import http from "k6/http";

const env = globalThis.__ENV ?? {};

export const options = {
  scenarios: {
    stagepilot_runtime: {
      executor: "shared-iterations",
      vus: Number(env.K6_VUS || 4),
      iterations: Number(env.K6_ITERATIONS || 24),
      maxDuration: env.K6_MAX_DURATION || "60s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
};

const baseUrl = (env.STAGEPILOT_BASE_URL || "http://127.0.0.1:8788").replace(
  /\/$/,
  ""
);
const operatorToken = (env.STAGEPILOT_OPERATOR_TOKEN || "").trim();
const operatorRole = (env.STAGEPILOT_OPERATOR_ROLE || "").trim();

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (operatorToken) {
    headers.Authorization = `Bearer ${operatorToken}`;
  }
  if (operatorRole) {
    headers["x-operator-role"] = operatorRole;
  }
  return headers;
}

export default function () {
  const headers = buildHeaders();
  const payload = {
    caseId: "k6-stagepilot-001",
    district: "Mapo-gu",
    notes: "Resident missed shifts and needs food support this week.",
    risks: ["food", "income"],
  };

  const plan = http.post(`${baseUrl}/v1/plan`, JSON.stringify(payload), {
    headers,
  });
  check(plan, {
    "plan status 200": (response) => response.status === 200,
  });

  const benchmark = http.post(
    `${baseUrl}/v1/benchmark`,
    JSON.stringify(payload),
    { headers }
  );
  check(benchmark, {
    "benchmark status 200": (response) => response.status === 200,
  });

  const scorecard = http.get(`${baseUrl}/v1/runtime-scorecard`, { headers });
  check(scorecard, {
    "scorecard status 200": (response) => response.status === 200,
    "scorecard has traffic": (response) =>
      Boolean(response.json("traffic.totalRequests")),
  });

  sleep(0.2);
}
