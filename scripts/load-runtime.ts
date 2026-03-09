import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createStagePilotApiServer } from "../src/api/stagepilot-server";

const iterations = Number.parseInt(
  process.env.STAGEPILOT_LOAD_ITERATIONS || "8",
  10
);
const operatorToken = String(
  process.env.STAGEPILOT_OPERATOR_TOKEN || ""
).trim();

function buildHeaders() {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (operatorToken) {
    headers.authorization = `Bearer ${operatorToken}`;
  }
  return headers;
}

async function main() {
  const server = createStagePilotApiServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("failed to resolve stage-pilot load test port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const payload = {
      caseId: "runtime-load-001",
      district: "Gangbuk-gu",
      notes:
        "Single resident missed two shifts and needs food support this week.",
      risks: ["food", "income"],
    };

    for (let index = 0; index < Math.max(1, iterations); index += 1) {
      const response = await fetch(`${baseUrl}/v1/plan`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`/v1/plan failed (${response.status})`);
      }
      await response.json();
    }

    const benchmarkResponse = await fetch(`${baseUrl}/v1/benchmark`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!benchmarkResponse.ok) {
      throw new Error(`/v1/benchmark failed (${benchmarkResponse.status})`);
    }
    await benchmarkResponse.json();

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
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
