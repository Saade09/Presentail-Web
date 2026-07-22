import { describe, it, expect } from "vitest";
import { clarityInjectPlugin, clarityPluginsForMode, CLARITY_PROJECT_ID } from "@/lib/clarityInjectPlugin";

const SAMPLE_HTML = `<!doctype html><html lang="en"><head><title>Presentail</title></head><body></body></html>`;

describe("clarityInjectPlugin — transformIndexHtml (production behaviour)", () => {
  it("injects the Clarity snippet before </head>", () => {
    const plugin = clarityInjectPlugin();
    const result = (plugin.transformIndexHtml as (html: string) => string)(SAMPLE_HTML);
    expect(result).toContain("clarity.ms/tag/");
    expect(result.indexOf("clarity.ms/tag/")).toBeLessThan(result.indexOf("</head>"));
  });

  it("inserts the snippet immediately before </head>, not after it", () => {
    const plugin = clarityInjectPlugin();
    const result = (plugin.transformIndexHtml as (html: string) => string)(SAMPLE_HTML);
    expect(result).toMatch(/clarity\.ms\/tag\/[^<]+<\/script>\s*<\/head>/);
  });

  it("includes the correct Clarity project ID in the injected snippet", () => {
    const plugin = clarityInjectPlugin();
    const result = (plugin.transformIndexHtml as (html: string) => string)(SAMPLE_HTML);
    expect(result).toContain(CLARITY_PROJECT_ID);
    expect(CLARITY_PROJECT_ID).toBe("mik1damp04");
  });

  it("preserves the rest of the HTML unchanged outside the injection site", () => {
    const plugin = clarityInjectPlugin();
    const result = (plugin.transformIndexHtml as (html: string) => string)(SAMPLE_HTML);
    expect(result).toContain("<title>Presentail</title>");
    expect(result).toContain("<body></body>");
  });
});

describe("clarityPluginsForMode — production / development guard", () => {
  it("returns the clarity plugin for production mode", () => {
    const plugins = clarityPluginsForMode("production");
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("presentail-clarity-inject");
  });

  it("returns an empty array for development mode", () => {
    const plugins = clarityPluginsForMode("development");
    expect(plugins).toHaveLength(0);
  });

  it("returns an empty array for any non-production mode string", () => {
    expect(clarityPluginsForMode("staging")).toHaveLength(0);
    expect(clarityPluginsForMode("test")).toHaveLength(0);
    expect(clarityPluginsForMode("")).toHaveLength(0);
  });

  it("development-mode HTML is untouched because no plugin is applied", () => {
    const plugins = clarityPluginsForMode("development");
    expect(plugins).toHaveLength(0);
    expect(SAMPLE_HTML).not.toContain("clarity.ms/tag/");
    expect(SAMPLE_HTML).not.toContain(CLARITY_PROJECT_ID);
  });
});

describe("clarityInjectPlugin — plugin metadata", () => {
  it("sets apply to 'build' so it never runs during dev-server mode", () => {
    const plugin = clarityInjectPlugin();
    expect(plugin.apply).toBe("build");
  });

  it("has a stable plugin name for Vite's internal plugin registry", () => {
    const plugin = clarityInjectPlugin();
    expect(plugin.name).toBe("presentail-clarity-inject");
  });
});
