export type AiTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AiRequestTelemetry = {
  attempts: number;
  retries: number;
  timedOut: boolean;
  latencyMs: number;
  usage?: AiTokenUsage;
};

export type AiRequestPolicy = {
  timeoutMs?: number;
  maxRetries?: number;
  minRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class AiRequestError extends Error {
  readonly code: "timeout" | "unavailable";

  constructor(code: "timeout" | "unavailable", message: string) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
  }
}

export class AiRequestFailure extends Error {
  readonly telemetry: AiRequestTelemetry;

  constructor(error: unknown, telemetry: AiRequestTelemetry) {
    super(error instanceof Error ? error.message : String(error), { cause: error });
    this.name = "AiRequestFailure";
    this.telemetry = telemetry;
  }
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  return typeof status === "number" ? status : undefined;
}

function isTimeout(error: unknown): boolean {
  if (error instanceof AiRequestError && error.code === "timeout") return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const text = `${String(candidate.name ?? "")} ${String(candidate.code ?? "")} ${String(candidate.message ?? "")}`.toLowerCase();
  return text.includes("timeout") || text.includes("aborted") || text.includes("aborterror");
}

/** Retry only transient provider, transport, and deadline failures. */
export function isRetryableAiError(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return status === 408 || status === 409 || status === 429 || status >= 500;
  if (isTimeout(error)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const text = `${String(candidate.code ?? "")} ${String(candidate.message ?? "")}`.toLowerCase();
  return /econnreset|econnrefused|enotfound|eai_again|network error|temporarily unavailable|service unavailable/.test(text);
}

function usageOf(value: unknown): AiTokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = (value as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const raw = usage as Record<string, unknown>;
  const number = (value: unknown): number | undefined => typeof value === "number" ? value : undefined;
  const normalized = {
    promptTokens: number(raw.prompt_tokens ?? raw.input_tokens),
    completionTokens: number(raw.completion_tokens ?? raw.output_tokens),
    totalTokens: number(raw.total_tokens),
  };
  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute one provider request with a hard per-attempt deadline and a small,
 * explicit retry budget. The operation receives a fresh signal per attempt.
 * Validation/parsing belongs in the operation or immediately after this
 * function; malformed output is deliberately not retried as a transient error.
 */
export async function executeAiRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  policy: AiRequestPolicy = {},
): Promise<{ value: T; telemetry: AiRequestTelemetry }> {
  const timeoutMs = policy.timeoutMs ?? 15_000;
  const maxRetries = Math.max(0, Math.min(policy.maxRetries ?? 2, 3));
  const minRetryDelayMs = policy.minRetryDelayMs ?? 250;
  const maxRetryDelayMs = policy.maxRetryDelayMs ?? 2_000;
  const sleep = policy.sleep ?? defaultSleep;
  const startedAt = Date.now();
  let attempts = 0;
  let timedOut = false;
  let lastError: unknown;

  while (attempts <= maxRetries) {
    attempts++;
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new AiRequestError("timeout", `AI request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const value = await Promise.race([operation(controller.signal), timeout]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      return {
        value,
        telemetry: {
          attempts,
          retries: attempts - 1,
          timedOut,
          latencyMs: Date.now() - startedAt,
          usage: usageOf(value),
        },
      };
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      lastError = error;
      if (attempts > maxRetries || !isRetryableAiError(error)) {
        throw new AiRequestFailure(error, {
          attempts,
          retries: attempts - 1,
          timedOut,
          latencyMs: Date.now() - startedAt,
        });
      }
      const delay = Math.min(maxRetryDelayMs, minRetryDelayMs * 2 ** (attempts - 1));
      await sleep(delay);
    }
  }

  throw new AiRequestFailure(lastError, {
    attempts,
    retries: Math.max(0, attempts - 1),
    timedOut,
    latencyMs: Date.now() - startedAt,
  });
}