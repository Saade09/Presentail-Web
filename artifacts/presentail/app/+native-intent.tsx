// Translates inbound URLs (custom-scheme deep links and universal/app links)
// into Expo Router paths. WordPress's password-reset email links are of the
// form `<wp-host>/wp-login.php?action=rp&key=...&login=...`. When such a URL
// reaches the app (via the `presentail://` scheme, a paste-bridge route, or a
// universal link configured for the WP host), forward it to the in-app reset
// screen so the user never sees the WordPress web form.

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const url = new URL(path, "presentail://_/");
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
