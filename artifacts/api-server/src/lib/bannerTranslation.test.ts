import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  getOpenAIClient: mocks.getClient,
  AiRequestFailure: class AiRequestFailure extends Error {},
  executeAiRequest: async (
    operation: (signal: AbortSignal) => Promise<unknown>,
  ) => ({
    value: await operation(new AbortController().signal),
    telemetry: {
      attempts: 1,
      retries: 0,
      timedOut: false,
      latencyMs: 1,
    },
  }),
}));

import { translateBanners } from "./bannerTranslation";
import { getBearSizeMap } from "./bearSizeInference";
import { translateCategoryOccasionNames } from "./categoryOccasionTranslation";
import { translateProductContent } from "./productTranslation";
import { dedupeCatalogAiRequest } from "./aiRequest";

describe("catalog AI workflow behavior", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.getClient.mockReset();
    mocks.getClient.mockReturnValue({
      chat: { completions: { create: mocks.create } },
    });
  });

  it("translates successfully and serves repeated content from cache", async () => {
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: '[{"title":"Bonjour cache"}]' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    });
    const input = [{ title: "Cache test title" }];

    await expect(translateBanners("fr", input)).resolves.toEqual([
      { title: "Bonjour cache" },
    ]);
    await expect(translateBanners("fr", input)).resolves.toEqual([
      { title: "Bonjour cache" },
    ]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent identical translations", async () => {
    let resolve!: (value: unknown) => void;
    mocks.create.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const input = [{ headline: "Concurrent unique headline" }];
    const first = translateBanners("ar", input);
    const second = translateBanners("ar", input);

    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    resolve({
      choices: [{ message: { content: '[{"headline":"متزامن"}]' } }],
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ headline: "متزامن" }],
      [{ headline: "متزامن" }],
    ]);
  });

  it("falls back to the original text for malformed output", async () => {
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
    });
    const input = [{ subtitle: "Malformed unique subtitle" }];

    await expect(translateBanners("el", input)).resolves.toEqual(input);
  });

  it("falls back without a provider client", async () => {
    mocks.getClient.mockReturnValue(null);
    const input = [{ ctaText: "Unavailable unique CTA" }];

    await expect(translateBanners("fr", input)).resolves.toEqual(input);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("bounds long descriptions before sending classification prompts", async () => {
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: '{"long-input":"medium"}' } }],
    });

    await getBearSizeMap([
      {
        id: "long-input",
        name: "Mystery plush",
        description: "z".repeat(10_000),
      },
    ]);

    const request = mocks.create.mock.calls[0]?.[0] as {
      messages?: Array<{ content?: string }>;
    };
    expect(request.messages?.[0]?.content?.length).toBeLessThan(2_000);
  });

  it("keeps translation APIs fail-open when in-flight admission is full", async () => {
    const releases: Array<() => void> = [];
    const pending = Array.from({ length: 512 }, (_, index) =>
      dedupeCatalogAiRequest(
        `translation-capacity-${index}`,
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve);
          }),
      ),
    );

    await expect(
      translateProductContent(
        "capacity-product",
        "fr",
        "Capacity product",
        "English description",
      ),
    ).resolves.toEqual({
      name: "Capacity product",
      description: "English description",
      translated: false,
    });
    await expect(
      translateCategoryOccasionNames(["Capacity category"], "fr"),
    ).resolves.toEqual(["Capacity category"]);
    expect(mocks.create).not.toHaveBeenCalled();

    for (const release of releases) release();
    await Promise.all(pending);
  });
});