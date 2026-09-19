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

async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function installSdk(loadFromElement = vi.fn()) {
  window.Trustpilot = { loadFromElement };
  return loadFromElement;
}

describe("injectTrustpilotScript", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    delete window.Trustpilot;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the official bootstrap once for concurrent callers", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const first = vi.fn();
    const second = vi.fn();

    injectTrustpilotScript(first);
    injectTrustpilotScript(second);

    const scripts = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC);
    expect(scripts).toHaveLength(1);

    installSdk();
    scripts[0].dispatchEvent(new Event("load"));
    await settleMicrotasks();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(1);
  });

  it("uses a pre-existing SDK without injecting another script", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const onLoad = vi.fn();
    installSdk();

    injectTrustpilotScript(onLoad);

    expect(onLoad).toHaveBeenCalledOnce();
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(0);
  });

  it("initializes after the SDK is installed by the bootstrap load event", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const onLoad = vi.fn();

    injectTrustpilotScript(onLoad);
    const script = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0];
    script.dispatchEvent(new Event("load"));
    // The browser has completed script execution before dispatching load. This
    // assignment models that ordering while also covering queued load handling.
    installSdk();
    await settleMicrotasks();

    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("reports a bootstrap error once and never retries or probes a template", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const onError = vi.fn();
    const remountError = vi.fn();
    const onLoad = vi.fn();

    injectTrustpilotScript(onLoad, onError);
    const script = trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0];
    script.dispatchEvent(new Event("error"));
    injectTrustpilotScript(onLoad, remountError);

    expect(onError).toHaveBeenCalledOnce();
    expect(remountError).toHaveBeenCalledOnce();
    expect(onLoad).not.toHaveBeenCalled();
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(1);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("treats a loaded script with no SDK global as a bootstrap failure", async () => {
    const { injectTrustpilotScript, TRUSTPILOT_SCRIPT_SRC } = await loadModule();
    const onError = vi.fn();

    injectTrustpilotScript(vi.fn(), onError);
    trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)[0].dispatchEvent(new Event("load"));
    await settleMicrotasks();

    expect(onError).toHaveBeenCalledOnce();
    expect(trustpilotScripts(TRUSTPILOT_SCRIPT_SRC)).toHaveLength(1);
  });
});

describe("pollAndLoadTrustpilotWidget", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    delete window.Trustpilot;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls loadFromElement exactly once for a mounted element", async () => {
    const { pollAndLoadTrustpilotWidget } = await loadModule();
    const el = document.createElement("div");
    const loadFromElement = installSdk();
    const onLoaded = vi.fn();
    const loader = pollAndLoadTrustpilotWidget(el, vi.fn(), onLoaded);

    loader.onScriptLoad();
    loader.onScriptLoad();

    expect(loadFromElement).toHaveBeenCalledOnce();
    expect(loadFromElement).toHaveBeenCalledWith(el, true);
    expect(onLoaded).toHaveBeenCalledOnce();
  });

  it("does not initialize an element after cleanup", async () => {
    const { pollAndLoadTrustpilotWidget } = await loadModule();
    const loadFromElement = installSdk();
    const loader = pollAndLoadTrustpilotWidget(document.createElement("div"));

    loader.cleanup();
    loader.onScriptLoad();

    expect(loadFromElement).not.toHaveBeenCalled();
  });

  it("falls back only when loadFromElement throws or returns false", async () => {
    const { pollAndLoadTrustpilotWidget } = await loadModule();
    const thrownFailure = vi.fn();
    installSdk(vi.fn(() => {
      throw new Error("widget failed");
    }));
    pollAndLoadTrustpilotWidget(
      document.createElement("div"),
      thrownFailure,
    ).onScriptLoad();
    expect(thrownFailure).toHaveBeenCalledOnce();

    vi.resetModules();
    const { pollAndLoadTrustpilotWidget: loadWidget } = await loadModule();
    const returnedFailure = vi.fn();
    installSdk(vi.fn(() => false));
    loadWidget(document.createElement("div"), returnedFailure).onScriptLoad();
    expect(returnedFailure).toHaveBeenCalledOnce();
  });

  it("initializes a newly mounted element after SPA unmount/remount", async () => {
    const { injectTrustpilotScript, pollAndLoadTrustpilotWidget } =
      await loadModule();
    const loadFromElement = installSdk();
    const firstElement = document.createElement("div");
    const firstLoader = pollAndLoadTrustpilotWidget(firstElement);

    injectTrustpilotScript(firstLoader.onScriptLoad);
    firstLoader.cleanup();

    const secondElement = document.createElement("div");
    const secondLoader = pollAndLoadTrustpilotWidget(secondElement);
    injectTrustpilotScript(secondLoader.onScriptLoad);

    expect(loadFromElement).toHaveBeenCalledTimes(2);
    expect(loadFromElement).toHaveBeenNthCalledWith(1, firstElement, true);
    expect(loadFromElement).toHaveBeenNthCalledWith(2, secondElement, true);
  });

  it("treats iframe creation as a successful SDK initialization without lifecycle logging", async () => {
    const { pollAndLoadTrustpilotWidget } = await loadModule();
    const el = document.createElement("div");
    const loadFromElement = installSdk(vi.fn(() => {
      const iframe = document.createElement("iframe");
      el.appendChild(iframe);
    }));
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const onLoaded = vi.fn();

    pollAndLoadTrustpilotWidget(el, vi.fn(), onLoaded).onScriptLoad();
    await settleMicrotasks();

    expect(loadFromElement).toHaveBeenCalledOnce();
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(debug).not.toHaveBeenCalled();
  });
});