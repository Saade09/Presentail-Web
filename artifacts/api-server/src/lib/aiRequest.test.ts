import { describe, expect, it, vi } from "vitest";
import {
  AiRequestFailure,
  createOpenAIClient,
  executeAiRequest,
} from "@workspace/integrations-openai-ai-server";
import { dedupeCatalogAiRequest } from "./aiRequest";

describe("executeAiRequest", () => {
  it("disables SDK retries so policy attempts equal provider attempts", () => {
    const client = createOpenAIClient({
      apiKey: "test-only",
      baseURL: "https://example.invalid/v1",
    });
    expect((client as unknown as { maxRetries: number }).maxRetries).toBe(0);
  });

  it("returns successful values with token and latency telemetry", async () => {
    const { value, telemetry } = await executeAiRequest(async () => ({
      ok: true,
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }));

    expect(value.ok).toBe(true);
    expect(telemetry).toMatchObject({
      attempts: 1,
      retries: 0,
      timedOut: false,
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
    });
  });

  it("does not retry malformed model output", async () => {
    const operation = vi.fn(async () => JSON.parse("{not-json"));

    await expect(
      executeAiRequest(operation, {
        maxRetries: 2,
        minRetryDelayMs: 0,
      }),
    ).rejects.toMatchObject({
      telemetry: { attempts: 1, retries: 0 },
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("aborts timed-out attempts and reports retry exhaustion", async () => {
    const operation = vi.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      executeAiRequest(operation, {
        timeoutMs: 5,
        maxRetries: 1,
        minRetryDelayMs: 0,
      }),
    ).rejects.toMatchObject({
      name: "AiRequestFailure",
      telemetry: { attempts: 2, retries: 1, timedOut: true },
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries transient failures but caps attempts", async () => {
    const operation = vi.fn(async () => {
      throw Object.assign(new Error("service unavailable"), { status: 503 });
    });

    try {
      await executeAiRequest(operation, {
        maxRetries: 2,
        minRetryDelayMs: 0,
      });
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AiRequestFailure);
      expect((error as AiRequestFailure).telemetry).toMatchObject({
        attempts: 3,
        retries: 2,
      });
    }
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

describe("dedupeCatalogAiRequest", () => {
  it("shares concurrent work and deletes the entry after settlement", async () => {
    let resolve!: (value: string) => void;
    const operation = vi.fn(
      () => new Promise<string>((done) => {
        resolve = done;
      }),
    );

    const first = dedupeCatalogAiRequest("same-content", operation);
    const second = dedupeCatalogAiRequest("same-content", operation);
    expect(first).toBe(second);
    expect(operation).toHaveBeenCalledTimes(1);

    resolve("done");
    await expect(Promise.all([first, second])).resolves.toEqual(["done", "done"]);

    await dedupeCatalogAiRequest("same-content", async () => "new");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("rejects new unique work at capacity without evicting active entries", async () => {
    const releases: Array<() => void> = [];
    const pending = Array.from({ length: 512 }, (_, index) =>
      dedupeCatalogAiRequest(
        `capacity-${index}`,
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve);
          }),
      ),
    );

    const original = pending[0];
    expect(
      dedupeCatalogAiRequest("capacity-0", async () => undefined),
    ).toBe(original);
    await expect(
      dedupeCatalogAiRequest("capacity-overflow", async () => undefined),
    ).rejects.toThrow("capacity is full");

    for (const release of releases) release();
    await Promise.all(pending);
  });
});