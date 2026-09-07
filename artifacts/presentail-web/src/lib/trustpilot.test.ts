// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TrustpilotModule = typeof import("./trustpilot");

async function loadModule(): Promise<TrustpilotModule> {
  vi.resetModules();
  return import("./trustpilot");
}

function trustpilotScripts(src: string): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(`script[src="${src}"]`),
  );
}

describe("injectTrustpilotScript", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = "";
    delete window.Trustpilot;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("injects the script once and queues concurrent callers", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const first = vi.fn();
    const second = vi.fn();

    injectTrustpilotScript(first);
    injectTrustpilotScript(second);

    const scripts = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC);
    expect(scripts).toHaveLength(1);
    scripts[0].dispatchEvent(new Event("load"));
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("piggy-backs on an existing script tag", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const existing = document.createElement("script");
    existing.src = TRUSTPILOT_SCRIPT_SRC;
    document.head.appendChild(existing);
    const onLoad = vi.fn();

    injectTrustpilotScript(onLoad);

    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toEqual([existing]);
    existing.dispatchEvent(new Event("load"));
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("retries two seconds after the first load error", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    injectTrustpilotScript(vi.fn());
    const first = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0];

    first.dispatchEvent(new Event("error"));
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1999);
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(1);
  });

  it("calls onError after the retry also fails", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const onError = vi.fn();
    injectTrustpilotScript(vi.fn(), onError);
    trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0].dispatchEvent(new Event("error"));
    await vi.advanceTimersByTimeAsync(2000);

    trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0].dispatchEvent(new Event("error"));

    expect(onError).toHaveBeenCalledOnce();
  });

  it("loads immediately without a script event when the SDK already exists", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    window.Trustpilot = { loadFromElement: vi.fn() };
    const onLoad = vi.fn();

    injectTrustpilotScript(onLoad);

    expect(onLoad).toHaveBeenCalledOnce();
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(0);
  });
});

describe("pollAndLoadTrustpilotWidget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = "";
    delete window.Trustpilot;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("calls loadFromElement once when the SDK is available", async () => {
    const { pollAndLoadTrustpilotWidget } = await loadModule();
    const el = document.createElement("div");
    const loadFromElement = vi.fn();
    window.Trustpilot = { loadFromElement };

    pollAndLoadTrustpilotWidget(el).onScriptLoad();

    expect(loadFromElement).toHaveBeenCalledOnce();
    expect(loadFromElement).toHaveBeenCalledWith(el, true);
  });

  it("replaces a completed stale script after polling and keeps concurrent callbacks", async () => {
    const {
      injectTrustpilotScript,
      pollAndLoadTrustpilotWidget,
      TRUSTPILOT_SCRIPT_SRC,
    } = await loadModule();
    const firstEl = document.createElement("div");
    const secondEl = document.createElement("div");
    const firstLoader = pollAndLoadTrustpilotWidget(firstEl);
    const secondLoader = pollAndLoadTrustpilotWidget(secondEl);

    injectTrustpilotScript(firstLoader.onScriptLoad);
    injectTrustpilotScript(secondLoader.onScriptLoad);
    const staleScript = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0];
    staleScript.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(20 * 250);

    const scripts = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(staleScript);

    const loadFromElement = vi.fn();
    window.Trustpilot = { loadFromElement };
    scripts[0].dispatchEvent(new Event("load"));
    expect(loadFromElement).toHaveBeenCalledTimes(2);
    expect(loadFromElement).toHaveBeenCalledWith(firstEl, true);
    expect(loadFromElement).toHaveBeenCalledWith(secondEl, true);
  });

  it("catches loadFromElement errors", async () => {
    const { pollAndLoadTrustpilotWidget } = await loadModule();
    const error = new Error("widget failed");
    window.Trustpilot = { loadFromElement: vi.fn(() => { throw error; }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      pollAndLoadTrustpilotWidget(document.createElement("div")).onScriptLoad(),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "[Trustpilot] loadFromElement threw:",
      error,
    );
  });

  it("cleanup cancels a pending poll timer", async () => {
    const { pollAndLoadTrustpilotWidget, TRUSTPILOT_SCRIPT_SRC } =
      await loadModule();
    const loader = pollAndLoadTrustpilotWidget(document.createElement("div"));
    loader.onScriptLoad();

    loader.cleanup();
    await vi.runAllTimersAsync();

    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(0);
  });
});