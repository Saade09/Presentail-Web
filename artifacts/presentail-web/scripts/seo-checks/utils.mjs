/**
 * seo-checks/utils.mjs
 *
 * Shared helpers for the SEO regression check suite.
 */

export async function fetchText(url, { followRedirects = true } = {}) {
  const opts = followRedirects ? {} : { redirect: "manual" };
  const res = await fetch(url, opts).catch(() => null);
  if (!res) return { status: 0, headers: {}, text: "", url };
  const text = await res.text().catch(() => "");
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text, url: res.url };
}

export async function fetchHead(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!res) return { status: 0, headers: {}, location: "" };
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    location: res.headers.get("location") ?? "",
  };
}

export function extractMeta(html, name) {
  const m = html.match(new RegExp(`name=["']${name}["']\\s+content=["']([^"']*)["']`));
  const m2 = html.match(new RegExp(`content=["']([^"']*)["']\\s+name=["']${name}["']`));
  return (m?.[1] ?? m2?.[1] ?? "").trim();
}

export function extractOgProp(html, prop) {
  const m = html.match(new RegExp(`property=["']${prop}["']\\s+content=["']([^"']*)["']`));
  const m2 = html.match(new RegExp(`content=["']([^"']*)["']\\s+property=["']${prop}["']`));
  return (m?.[1] ?? m2?.[1] ?? "").trim();
}

export function extractTitle(html) {
  return (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").trim();
}

export function extractCanonical(html) {
  return (html.match(/rel=["']canonical["'][^>]*href=["']([^"']*)["']/)?.[1] ?? "").trim();
}

export function extractLang(html) {
  return html.match(/<html[^>]+lang=["']([^"']*)["']/)?.[1] ?? "";
}

export function extractDir(html) {
  return html.match(/<html[^>]+dir=["']([^"']*)["']/)?.[1] ?? "";
}

export function extractH1Count(html) {
  return (html.match(/<h1[\s>]/gi) ?? []).length;
}

export function extractH1Text(html) {
  return (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
}

export function extractHreflangValues(html) {
  const matches = [...html.matchAll(/hreflang=["']([^"']*)["']/gi)];
  return matches.map((m) => m[1]);
}

export function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      // skip unparseable blocks
    }
  }
  return blocks;
}

export function getGraphNodes(jsonld) {
  const nodes = [];
  for (const block of jsonld) {
    if (block["@graph"]) nodes.push(...block["@graph"]);
    else nodes.push(block);
  }
  return nodes;
}

export function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}
