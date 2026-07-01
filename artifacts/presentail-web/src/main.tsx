import { createRoot } from "react-dom/client";
import { setCustomHeadersGetter } from "@workspace/api-client-react";
import App from "./App";
import { trackWebVitals } from "./lib/analytics";
import { installChunkReloadHandlers } from "./lib/chunkReload";
import "./index.css";

// Recover from stale/failed dynamic chunk loads (e.g. iOS Safari serving a
// stale index.html after a redeploy) before React starts lazy-loading routes.
installChunkReloadHandlers();

const LOCATION_STORAGE_KEY = "presentail_delivery_location_v1";

setCustomHeadersGetter(() => {
  const headers: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.countryCode) headers["x-store-country"] = parsed.countryCode;
      if (parsed?.cityId) headers["x-store-city"] = parsed.cityId;
    }
  } catch {
  }
  return headers;
});

createRoot(document.getElementById("root")!).render(<App />);
trackWebVitals();
