import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Middleware,
} from "@ai-sdk/provider";
import type { ToolResultPart } from "@ai-sdk/provider-utils";
import type { ToolResponsePromptTemplateResult } from "./core/prompts/shared/tool-role-to-user-message";
import type { TCMCoreProtocol } from "./core/protocols/protocol-interface";
import { isTCMProtocolFactory } from "./core/protocols/protocol-interface";
import { wrapGenerate as wrapGenerateHandler } from "./generate-handler";
import { wrapStream as wrapStreamHandler } from "./stream-handler";
import { isOtelEnabled, SpanStatusCode, tracer } from "./telemetry";
import { toolCallParseDuration, toolCallsTotal } from "./telemetry/metrics";
import { transformParams } from "./transform-handler";

export function createToolMiddleware({
  protocol,
  toolSystemPromptTemplate,
  toolResponsePromptTemplate,
  placement = "last",
}: {
  protocol: TCMCoreProtocol | (() => TCMCoreProtocol);
  toolSystemPromptTemplate: (tools: LanguageModelV3FunctionTool[]) => string;
  toolResponsePromptTemplate?: (
    toolResult: ToolResultPart
  ) => ToolResponsePromptTemplateResult;
  placement?: "first" | "last";
}): LanguageModelV3Middleware {
  const resolvedProtocol = isTCMProtocolFactory(protocol)
    ? protocol()
    : protocol;

  const protocolName =
    (resolvedProtocol as { name?: string }).name ?? "unknown";

  return {
    specificationVersion: "v3",
    wrapStream: ({ doStream, doGenerate, params }) => {
      if (!isOtelEnabled()) {
        return wrapStreamHandler({
          protocol: resolvedProtocol,
          doStream,
          doGenerate,
          params,
        });
      }
      return tracer.startActiveSpan(
        "tool-call-middleware.wrapStream",
        async (span) => {
          span.setAttribute("protocol", protocolName);
          const start = performance.now();
          try {
            const result = await wrapStreamHandler({
              protocol: resolvedProtocol,
              doStream,
              doGenerate,
              params,
            });
            span.setStatus({ code: SpanStatusCode.OK });
            toolCallsTotal.add(1, {
              protocol: protocolName,
              status: "success",
            });
            return result;
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(err),
            });
            toolCallsTotal.add(1, { protocol: protocolName, status: "error" });
            throw err;
          } finally {
            toolCallParseDuration.record(performance.now() - start, {
              protocol: protocolName,
            });
            span.end();
          }
        }
      );
    },
    wrapGenerate: ({ doGenerate, params }) => {
      if (!isOtelEnabled()) {
        return wrapGenerateHandler({
          protocol: resolvedProtocol,
          doGenerate,
          params,
        });
      }
      return tracer.startActiveSpan(
        "tool-call-middleware.wrapGenerate",
        async (span) => {
          span.setAttribute("protocol", protocolName);
          const start = performance.now();
          try {
            const result = await wrapGenerateHandler({
              protocol: resolvedProtocol,
              doGenerate,
              params,
            });
            span.setStatus({ code: SpanStatusCode.OK });
            toolCallsTotal.add(1, {
              protocol: protocolName,
              status: "success",
            });
            return result;
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(err),
            });
            toolCallsTotal.add(1, { protocol: protocolName, status: "error" });
            throw err;
          } finally {
            toolCallParseDuration.record(performance.now() - start, {
              protocol: protocolName,
            });
            span.end();
          }
        }
      );
    },
    transformParams: async ({ params }): Promise<LanguageModelV3CallOptions> =>
      transformParams({
        protocol: resolvedProtocol,
        toolSystemPromptTemplate,
        toolResponsePromptTemplate,
        placement,
        params,
      }),
  };
}
