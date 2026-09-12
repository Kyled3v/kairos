import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { trace, metrics, context, SpanStatusCode, type Span } from "@opentelemetry/api";

export { SpanStatusCode, trace, metrics, context };
export type { Span };

let sdk: NodeSDK | undefined;

export interface TelemetryOptions {
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly otlpEndpoint?: string;
}

export function initTelemetry(options: TelemetryOptions = {}): void {
  if (sdk !== undefined) return;

  const endpoint = options.otlpEndpoint ?? process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4318";
  const serviceName = options.serviceName ?? "kairos";
  const serviceVersion = options.serviceVersion ?? "0.1.0";

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint + "/v1/traces" }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint + "/v1/metrics" }),
      exportIntervalMillis: 10_000,
    }),
  });

  sdk.start();

  process.on("SIGTERM", () => { void sdk?.shutdown(); });
  process.on("SIGINT",  () => { void sdk?.shutdown(); });
}

export function shutdownTelemetry(): Promise<void> {
  return sdk?.shutdown() ?? Promise.resolve();
}

/** Wrap an async function in a named span. Sets error status on throw. */
export async function withSpan<T>(
  tracer: string,
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const t = trace.getTracer(tracer);
  return t.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
