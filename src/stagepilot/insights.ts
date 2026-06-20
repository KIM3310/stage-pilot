import {
  DEFAULT_GEMINI_HTTP_TIMEOUT_MS,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  normalizeGeminiHttpTimeoutMs,
} from "./agents";
import type { StagePilotResult } from "./types";

const TRAILING_SLASHES_REGEX = /\/+$/;

export interface StagePilotInsights {
  kpis: {
    judgeScore: number;
    referralCount: number;
    slaMinutes: number;
    topPrograms: string[];
  };
  narrative: string;
  source: "fallback" | "gemini" | "openrouter";
}

function buildFallbackNarrative(result: StagePilotResult): string {
  const topPrograms = result.eligibility.referrals
    .slice(0, 2)
    .map((referral) => referral.programName)
    .join(", ");

  return [
    `Case ${result.intake.caseId} in ${result.intake.district} is routed with score ${result.judge.score}.`,
    `Primary programs: ${topPrograms || "citywide hotline routing"}.`,
    `SLA target is ${result.safety.slaMinutes} minutes; execute first two actions within 2 hours.`,
  ].join(" ");
}

function buildGeminiPrompt(result: StagePilotResult): string {
  const context = {
    eligibility: result.eligibility,
    intake: result.intake,
    judge: result.judge,
    ontology: result.ontology,
    plan: result.plan,
    safety: result.safety,
  };

  return [
    "You are helping a social-welfare operations manager.",
    "Generate a concise insights summary grounded in ontology entities and referrals.",
    "Output exactly 3 bullets:",
    "1) risk/priority diagnosis",
    "2) recommended immediate intervention sequence",
    "3) operational caveat tied to SLA and referral coverage",
    "",
    JSON.stringify(context),
  ].join("\n");
}

async function readJsonWithTimeout<T>(
  response: Response,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      try {
        const body = response.body;
        if (body) {
          body.cancel().catch(() => {
            // best-effort cancellation
          });
        }
      } catch {
        // best-effort cancellation
      }
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([response.json() as Promise<T>, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function summarizeWithGemini(options: {
  apiKey: string;
  fallbackModel?: string;
  model: string;
  result: StagePilotResult;
  timeoutMs: number;
}): Promise<string> {
  const models = Array.from(
    new Set(
      [options.model, options.fallbackModel].filter((value): value is string =>
        Boolean(value)
      )
    )
  );
  let lastError: unknown;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: buildGeminiPrompt(options.result) }],
            },
          ],
        }),
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": options.apiKey,
        },
        method: "POST",
        signal: controller.signal,
      });
    } catch (error) {
      lastError =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError"
          ? new Error(
              `Gemini insights request timed out (${options.timeoutMs}ms)`
            )
          : error;
      clearTimeout(timeoutId);
      continue;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      lastError = new Error(
        `Gemini insights request failed: ${response.status}`
      );
      continue;
    }

    const data = await readJsonWithTimeout<{
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    }>(
      response,
      options.timeoutMs,
      `Gemini insights response body timed out (${options.timeoutMs}ms)`
    );

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
    lastError = new Error("Gemini insights response missing text");
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini insights request failed");
}

async function summarizeWithOpenRouter(options: {
  apiKey: string;
  appTitle?: string;
  baseUrl?: string;
  httpReferer?: string;
  model: string;
  result: StagePilotResult;
  timeoutMs: number;
}): Promise<string> {
  const baseUrl = (
    options.baseUrl?.trim() || DEFAULT_OPENROUTER_BASE_URL
  ).replace(TRAILING_SLASHES_REGEX, "");
  const model = options.model.trim() || DEFAULT_OPENROUTER_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are helping a social-welfare operations manager. Return exactly 3 concise bullets.",
          },
          { role: "user", content: buildGeminiPrompt(options.result) },
        ],
      }),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          options.httpReferer?.trim() || "https://stage-pilot.pages.dev",
        "X-OpenRouter-Title": options.appTitle?.trim() || "stage-pilot",
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    throw typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
      ? new Error(
          `OpenRouter insights request timed out (${options.timeoutMs}ms)`
        )
      : error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`OpenRouter insights request failed: ${response.status}`);
  }

  const data = await readJsonWithTimeout<{
    choices?: Array<{ message?: { content?: string } }>;
  }>(
    response,
    options.timeoutMs,
    `OpenRouter insights response body timed out (${options.timeoutMs}ms)`
  );
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter insights response missing text");
  }
  return text;
}

export async function deriveStagePilotInsights(options: {
  apiKey?: string;
  appTitle?: string;
  baseUrl?: string;
  fallbackModel?: string;
  httpReferer?: string;
  model?: string;
  provider?: "gemini" | "openrouter";
  result: StagePilotResult;
  timeoutMs?: number;
}): Promise<StagePilotInsights> {
  const topPrograms = options.result.eligibility.referrals
    .slice(0, 3)
    .map((referral) => referral.programName);
  const kpis = {
    judgeScore: options.result.judge.score,
    referralCount: options.result.eligibility.referrals.length,
    slaMinutes: options.result.safety.slaMinutes,
    topPrograms,
  };

  const apiKey = options.apiKey;
  const provider = options.provider ?? "gemini";
  const model =
    options.model ??
    (provider === "openrouter"
      ? DEFAULT_OPENROUTER_MODEL
      : "gemini-3.1-pro-preview");
  const timeoutMs = normalizeGeminiHttpTimeoutMs(
    options.timeoutMs ?? DEFAULT_GEMINI_HTTP_TIMEOUT_MS
  );
  if (!apiKey) {
    return {
      kpis,
      narrative: buildFallbackNarrative(options.result),
      source: "fallback",
    };
  }

  try {
    if (provider === "openrouter") {
      const narrative = await summarizeWithOpenRouter({
        apiKey,
        appTitle: options.appTitle,
        baseUrl: options.baseUrl,
        httpReferer: options.httpReferer,
        model,
        result: options.result,
        timeoutMs,
      });
      return {
        kpis,
        narrative,
        source: "openrouter",
      };
    }

    const narrative = await summarizeWithGemini({
      apiKey,
      fallbackModel: options.fallbackModel,
      model,
      result: options.result,
      timeoutMs,
    });
    return {
      kpis,
      narrative,
      source: "gemini",
    };
  } catch {
    return {
      kpis,
      narrative: buildFallbackNarrative(options.result),
      source: "fallback",
    };
  }
}
