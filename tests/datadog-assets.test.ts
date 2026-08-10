import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
  new URL("../scripts/datadog-assets.mjs", import.meta.url)
);

function runScript(
  args: string[],
  credentialEnv: Record<string, string>,
  evalSource?: string
) {
  return spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      DD_API_KEY: "",
      DD_APP_KEY: "",
      ...credentialEnv,
    },
    input: evalSource,
  });
}

describe("datadog asset CLI credential output", () => {
  it("reports only static credential statuses in plan mode", () => {
    const apiSecret = "api-secret-that-must-not-appear";
    const applicationSecret = "app-secret-that-must-not-appear";
    const result = runScript([scriptPath, "plan"], {
      DD_API_KEY: apiSecret,
      DD_APP_KEY: applicationSecret,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).credentials).toEqual({
      api: "configured",
      application: "configured",
    });
    expect(result.stdout).not.toContain(apiSecret);
    expect(result.stdout).not.toContain(applicationSecret);
  });

  it("reports validation outcomes without exposing credential values", () => {
    const apiSecret = "validated-api-secret-that-must-not-appear";
    const applicationSecret = "validated-app-secret-that-must-not-appear";
    const scriptUrl = pathToFileURL(scriptPath).href;
    const source = `
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ valid: true }),
        text: async () => "",
      });
      process.argv[2] = "validate";
      await import(${JSON.stringify(scriptUrl)});
    `;
    const result = runScript(
      ["--input-type=module"],
      { DD_API_KEY: apiSecret, DD_APP_KEY: applicationSecret },
      source
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      api: "valid",
      application: "configured",
    });
    expect(result.stdout).not.toContain(apiSecret);
    expect(result.stdout).not.toContain(applicationSecret);
  });
});
