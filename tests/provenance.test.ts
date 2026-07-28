import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as Record<string, unknown>;
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const upstreamOwnershipStatement =
  /StagePilot does not publish or control the `@ai-sdk-tool\/parser`\s+npm package\./;

describe("distribution provenance", () => {
  it("keeps the StagePilot source workspace non-publishable", () => {
    expect(packageJson.name).toBe("stagepilot-reliability-lab");
    expect(packageJson.private).toBe(true);
    expect(packageJson).not.toHaveProperty("publishConfig");
  });

  it("states upstream parser ownership without ambiguity", () => {
    expect(readme).toMatch(upstreamOwnershipStatement);
    expect(readme).toContain(
      "https://github.com/minpeter/ai-sdk-tool-call-middleware"
    );
  });
});
