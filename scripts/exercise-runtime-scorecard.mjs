const baseUrl = String(
  process.env.STAGEPILOT_API_BASE_URL || "http://127.0.0.1:8080"
).replace(/\/$/, "");
const operatorToken = String(process.env.STAGEPILOT_OPERATOR_TOKEN || "");

function buildHeaders() {
  const headers = { "content-type": "application/json" };
  if (operatorToken) {
    headers.authorization = `Bearer ${operatorToken}`;
  }
  return headers;
}

const payload = {
  caseId: "runtime-001",
  district: "Gangbuk-gu",
  notes: "Single resident missed two shifts and needs food support this week.",
  risks: ["food", "income"],
};

async function post(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status})`);
  }
  return response.json();
}

async function run() {
  await post("/v1/plan");
  await post("/v1/benchmark");
  const scorecardResponse = await fetch(`${baseUrl}/v1/runtime-scorecard`);
  if (!scorecardResponse.ok) {
    throw new Error(`runtime scorecard failed (${scorecardResponse.status})`);
  }
  const scorecard = await scorecardResponse.json();
  console.log(
    JSON.stringify(
      {
        traffic: scorecard.traffic,
        persistence: scorecard.persistence,
        operatorAuth: scorecard.operatorAuth,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
