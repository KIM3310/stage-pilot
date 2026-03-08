import { describe, expect, it } from "vitest";

import worker from "../src/api/worker-entry";

describe("stagepilot edge worker CORS", () => {
  it("echoes allowed origins", async () => {
    const fetchHandler = worker.fetch;
    expect(fetchHandler).toBeTypeOf("function");
    if (!fetchHandler) {
      throw new Error("worker fetch handler is missing");
    }
    const response = await fetchHandler(
      new Request("https://stage-pilot.pages.dev/health", {
        headers: { Origin: "https://stage-pilot.pages.dev" },
      }),
      {},
      {} as never
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://stage-pilot.pages.dev"
    );
  });

  it("rejects disallowed preflight origins", async () => {
    const fetchHandler = worker.fetch;
    expect(fetchHandler).toBeTypeOf("function");
    if (!fetchHandler) {
      throw new Error("worker fetch handler is missing");
    }
    const response = await fetchHandler(
      new Request("https://stage-pilot.pages.dev/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://unexpected.example",
          "Access-Control-Request-Method": "GET",
        },
      }),
      {},
      {} as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "origin_not_allowed",
    });
  });
});
