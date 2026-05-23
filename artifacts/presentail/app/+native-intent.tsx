// Translates inbound URLs (custom-scheme deep links and universal/app links)
// into Expo Router paths.
//
// Handled patterns:
//   1. Product universal links — `presentail.com/product/<slug>` (iOS Universal
//      Links / Android App Links) → `/product/<slug>` so the recipient lands
//      directly on the product detail screen when the app is installed.
//   2. WordPress password-reset links — `<wp-host>/wp-login.php?action=rp&key=
//      ...&login=...` → `/reset-password?key=...&login=...` so the user never
//      sees the WordPress web form.

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const url = new URL(path, "presentail://_/");

    // Product universal/app links: presentail.com/product/<slug>
    const productMatch = /^\/product\/([^/?#]+)/.exec(url.pathname);
    if (productMatch) {
      const slug = decodeURIComponent(productMatch[1]);
      return `/product/${encodeURIComponent(slug)}`;
    }

    // WordPress password-reset links.
    const action = url.searchParams.get("action");
    const key = url.searchParams.get("key");
    const login = url.searchParams.get("login");
    const looksLikeWpReset =
      action === "rp" ||
      action === "resetpass" ||
      /wp-login\.php/i.test(url.pathname);
    if (looksLikeWpReset && key && login) {
      const qs = new URLSearchParams({ key, login }).toString();
      return `/reset-password?${qs}`;
    }
  } catch {
    // fall through
  }
  return path;
}
