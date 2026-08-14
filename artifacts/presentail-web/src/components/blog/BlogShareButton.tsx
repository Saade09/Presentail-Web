import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { trackWebEvent } from "@/lib/analytics";

type Props = {
  articleSlug: string;
  locale: string;
  title: string;
  /** Localized "Share" label. */
  label: string;
  /** Localized "Link copied" confirmation. */
  copiedLabel: string;
};

/**
 * Understated Share action next to the article CTA. Uses the Web Share API
 * where supported, with a copy-link fallback. Fires one `blog_share` web
 * event per interaction (method: "web_share" | "copy_link").
 */
export function BlogShareButton({ articleSlug, locale, title, label, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const url = window.location.href;
    let method = "copy_link";
    try {
      if (typeof navigator.share === "function") {
        method = "web_share";
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet; don't track or fall back.
      if ((err as Error | undefined)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        method = "copy_link";
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        return;
      }
    }
    trackWebEvent({
      type: "blog_share",
      properties: { article_slug: articleSlug, locale, method, placement: "intro" },
    });
  };

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md transition-colors"
      data-testid="blog-post-share"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" aria-hidden="true" />
          <span aria-live="polite">{copiedLabel}</span>
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  );
}
