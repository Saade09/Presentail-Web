import { Router, type IRouter } from "express";
import { z } from "zod";
import { checkAdminToken } from "../lib/admin-auth";
import { getOsProductBySlug, getOsProducts } from "../lib/osProductsCache";
import {
  buildProductSocialVersion,
  clampSocialControl,
  normaliseSocialLayout,
  selectProductSocialImage,
} from "../lib/productSocialShare";
import {
  getProductSocialShare,
  rowToProductSocialOverrides,
  upsertProductSocialShare,
} from "../lib/productSocialShareStore";
import { invalidateProductSocialCardCache } from "./ogImage";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;
const imageRefSchema = z.string().max(2_048).nullable().optional().refine(
  (value) => {
    if (value === undefined || value === null || value.startsWith("/objects/")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "presentail.com" || url.hostname.endsWith(".presentail.com"));
    } catch {
      return false;
    }
  },
  "Image must be a private object path or an approved Presentail HTTPS URL",
);
const patchSchema = z.object({
  customImageUrl: imageRefSchema,
  preferredImageUrl: imageRefSchema,
  layout: z.enum(["product", "portrait", "photo", "custom"]).optional(),
  focalX: z.number().finite().min(0).max(1).nullable().optional(),
  focalY: z.number().finite().min(0).max(1).nullable().optional(),
  scale: z.number().finite().min(0.5).max(2).nullable().optional(),
  positionX: z.number().finite().min(-1).max(1).nullable().optional(),
  positionY: z.number().finite().min(-1).max(1).nullable().optional(),
});

function getProduct(slug: string) {
  for (const storeKey of STORE_KEYS) {
    const product = getOsProductBySlug(slug, storeKey);
    if (product) return product;
  }
  return null;
}

// Browser-facing admin surface, following the token-in-page convention used
// by the other API-admin dashboards. It consumes the secured JSON endpoints
// below rather than creating a second control path.
router.get("/admin/product-social", (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Product social sharing — Admin</title>
  <style>body{font:14px system-ui;margin:32px;background:#f7f1e7;color:#173c31}main{max-width:1000px;margin:auto}input,select,button{padding:8px;margin:4px}img{max-width:600px;width:100%;border:1px solid #c9a96e}fieldset{margin:16px 0;border:1px solid #c9a96e}label{display:inline-block;margin:4px}</style></head>
  <body><main><h1>Social sharing preview</h1><p>Preview, inspect quality flags, adjust composition, upload a custom image, and regenerate before publication.</p>
  <label>Admin token <input id="token" type="password" autocomplete="off"></label><label>Product slug <input id="slug" placeholder="ivory-rose-vase"></label><button id="load">Load preview</button>
  <section id="result" hidden><h2 id="name"></h2><img id="card" alt="Social sharing card preview"><h3>Thumbnail</h3><img id="thumb" alt="Social sharing card thumbnail" style="max-width:300px"><p id="meta"></p><p><strong>Quality flags:</strong> <span id="flags"></span></p>
  <fieldset><legend>Composition controls</legend><label>Layout <select id="layout"><option>product</option><option>portrait</option><option>photo</option><option>custom</option></select></label>
  <label>Focal X <input id="focalX" type="number" min="0" max="1" step=".01"></label><label>Focal Y <input id="focalY" type="number" min="0" max="1" step=".01"></label>
  <label>Scale <input id="scale" type="number" min=".5" max="2" step=".01"></label><label>Position X <input id="positionX" type="number" min="-1" max="1" step=".01"></label><label>Position Y <input id="positionY" type="number" min="-1" max="1" step=".01"></label>
  <label>Custom social image URL/path <input id="customImageUrl" size="44" placeholder="/objects/..."></label><label>Upload replacement <input id="upload" type="file" accept="image/jpeg,image/png,image/webp"></label><button id="save">Save controls</button><button id="regenerate">Regenerate</button></fieldset></section><pre id="error"></pre>
  <script>
  const $=id=>document.getElementById(id), fields=['layout','focalX','focalY','scale','positionX','positionY','customImageUrl'];
  let current; const headers=()=>({'x-push-admin-token':$('token').value,'content-type':'application/json'});
  function apply(data){current=data;$('result').hidden=false;$('name').textContent=data.product?.name||'Unknown product';const t=Date.now();$('card').src=data.previewUrl+'&t='+t;$('thumb').src=data.thumbnailUrl+'&t='+t;$('meta').textContent='JPEG '+data.metadata?.imageWidth+'×'+data.metadata?.imageHeight+' · version '+data.version;$('flags').textContent=(data.qualityFlags||[]).join(', ')||'None'; for(const key of ['layout','focalX','focalY','scale','positionX','positionY']) $(key).value=data.controls[key]; $('customImageUrl').value=data.selectedImage?.source==='custom'?data.selectedImage.url:'';}
  async function load(){const slug=$('slug').value.trim();const r=await fetch('/api/admin/product-social/'+encodeURIComponent(slug),{headers:headers()});const d=await r.json();if(!r.ok)throw Error(d.message||'Unable to load');apply(d)}
  $('load').onclick=()=>load().catch(e=>$('error').textContent=e.message);
  $('upload').onchange=async()=>{try{const file=$('upload').files[0];if(!file)return;const slug=$('slug').value.trim();const r=await fetch('/api/admin/product-social/'+encodeURIComponent(slug)+'/upload-url',{method:'POST',headers:headers()});const target=await r.json();if(!r.ok)throw Error(target.message||'Unable to create upload');const put=await fetch(target.uploadUrl,{method:'PUT',headers:{'content-type':file.type||'application/octet-stream'},body:file});if(!put.ok)throw Error('Upload failed');$('customImageUrl').value=target.objectPath}catch(e){$('error').textContent=e.message}};
  $('save').onclick=async()=>{try{const body={layout:$('layout').value};for(const key of ['focalX','focalY','scale','positionX','positionY'])body[key]=Number($(key).value);body.customImageUrl=$('customImageUrl').value.trim()||null;const r=await fetch('/api/admin/product-social/'+encodeURIComponent($('slug').value.trim()),{method:'PATCH',headers:headers(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message||'Unable to save');apply(d)}catch(e){$('error').textContent=e.message}};
  $('regenerate').onclick=async()=>{try{const r=await fetch('/api/admin/product-social/'+encodeURIComponent($('slug').value.trim())+'/regenerate',{method:'POST',headers:headers()});const d=await r.json();if(!r.ok)throw Error(d.message||'Unable to regenerate');apply(d)}catch(e){$('error').textContent=e.message}};
  </script></main></body></html>`);
});

function previewResponse(slug: string, product: ReturnType<typeof getProduct>, row: Awaited<ReturnType<typeof getProductSocialShare>>) {
  const overrides = rowToProductSocialOverrides(row);
  const selection = selectProductSocialImage(product, overrides);
  const version = buildProductSocialVersion(selection?.url ?? null, overrides);
  const previewUrl = `/api/og-image/product/${encodeURIComponent(slug)}?v=${version}`;
  return {
    ok: true,
    product: product ? { slug, name: product.name, inStock: product.inStock } : null,
    selectedImage: selection,
    metadata: product
      ? {
          title: `${product.name} | Presentail`,
          description: "Luxury gifting, delivered.",
          ogType: "product",
          imageMimeType: "image/jpeg",
          imageWidth: 1200,
          imageHeight: 630,
          imageAlt: `Presentail share image for ${product.name}`,
        }
      : null,
    controls: {
      layout: normaliseSocialLayout(overrides.layout),
      focalX: clampSocialControl(overrides.focalX, 0, 1, 0.5),
      focalY: clampSocialControl(overrides.focalY, 0, 1, 0.5),
      scale: clampSocialControl(overrides.scale, 0.5, 2, 1),
      positionX: clampSocialControl(overrides.positionX, -1, 1, 0),
      positionY: clampSocialControl(overrides.positionY, -1, 1, 0),
    },
    qualityFlags: row?.qualityFlags ?? [],
    templateVersion: overrides.templateVersion,
    version,
    previewUrl,
    thumbnailUrl: `${previewUrl}&thumbnail=1`,
  };
}

router.get("/admin/product-social/:slug", async (req, res): Promise<void> => {
  if (!checkAdminToken(req, res)) return;
  const slug = String(req.params.slug ?? "").trim();
  if (!slug) {
    res.status(400).json({ ok: false, message: "Missing product slug" }); // i18n-ignore
    return;
  }
  try {
    res.json(previewResponse(slug, getProduct(slug), await getProductSocialShare(slug)));
  } catch (err) {
    req.log.warn({ err, slug }, "admin product social: preview lookup failed");
    res.status(500).json({ ok: false, message: "Unable to load social sharing controls" }); // i18n-ignore
  }
});

router.patch("/admin/product-social/:slug", async (req, res): Promise<void> => {
  if (!checkAdminToken(req, res)) return;
  const slug = String(req.params.slug ?? "").trim();
  const parsed = patchSchema.safeParse(req.body);
  if (!slug || !parsed.success) {
    res.status(400).json({ ok: false, message: parsed.error?.message ?? "Invalid product social controls" }); // i18n-ignore
    return;
  }
  try {
    const row = await upsertProductSocialShare(slug, parsed.data);
    invalidateProductSocialCardCache(slug);
    res.json(previewResponse(slug, getProduct(slug), row));
  } catch (err) {
    req.log.warn({ err, slug }, "admin product social: update failed");
    res.status(500).json({ ok: false, message: "Unable to save social sharing controls" }); // i18n-ignore
  }
});

router.post("/admin/product-social/:slug/regenerate", async (req, res): Promise<void> => {
  if (!checkAdminToken(req, res)) return;
  const slug = String(req.params.slug ?? "").trim();
  if (!slug) {
    res.status(400).json({ ok: false, message: "Missing product slug" }); // i18n-ignore
    return;
  }
  try {
    const row = await upsertProductSocialShare(slug, {});
    invalidateProductSocialCardCache(slug);
    res.json(previewResponse(slug, getProduct(slug), row));
  } catch (err) {
    req.log.warn({ err, slug }, "admin product social: regeneration failed");
    res.status(500).json({ ok: false, message: "Unable to regenerate social card" }); // i18n-ignore
  }
});

router.post("/admin/product-social/:slug/upload-url", async (req, res): Promise<void> => {
  if (!checkAdminToken(req, res)) return;
  const slug = String(req.params.slug ?? "").trim();
  if (!slug) {
    res.status(400).json({ ok: false, message: "Missing product slug" }); // i18n-ignore
    return;
  }
  try {
    const upload = await new ObjectStorageService().createObjectEntityUpload(`product-social/${slug}`);
    res.json({ ok: true, ...upload, expiresInSeconds: 900 });
  } catch (err) {
    req.log.warn({ err, slug }, "admin product social: upload URL failed");
    res.status(503).json({ ok: false, message: "Object storage is unavailable" }); // i18n-ignore
  }
});

// Idempotent warm-up inventory for an external admin. Cards are still generated
// by the public endpoint, so rerunning this never changes catalog data.
router.get("/admin/product-social/backfill", async (req, res): Promise<void> => {
  if (!checkAdminToken(req, res)) return;
  const products = new Map<string, { id: string; inStock: boolean }>();
  for (const storeKey of STORE_KEYS) {
    for (const product of getOsProducts(storeKey) ?? []) {
      products.set(product.id, product);
    }
  }
  res.json({
    ok: true,
    activeProductCount: [...products.values()].filter((p) => p.inStock).length,
    command: "pnpm --filter @workspace/api-server run backfill:product-social",
    concurrency: 4,
  });
});

export default router;