---
name: Phone tooltip overflow debugging
description: Web-vs-native tooltip confusion in "mobile view" bug reports, plus Radix side-placement overflow limits
---

# Phone tooltip overflow lessons

**Rule 1:** When a user reports a "mobile view" UI bug with a screenshot, verify WHICH surface they're on before fixing. The web app at mobile width and the native app look nearly identical. Distinguish by rendering details: arrow/caret direction, browser scrollbar at the edge, Radix vs native popup styling.

**Why:** Three native-app fix iterations were shipped for a phone-tooltip overflow that was actually the web checkout's Radix Popover — the native code was never what the user saw.

**Rule 2:** Radix Popover `side="right"|"left"` cannot save content wider than the available horizontal space — collision shifting only moves content along the *align* axis (vertical for side placements), and flipping just swaps sides. If the bubble may exceed half the viewport width, use `side="bottom"` (or "top"), where the shift axis is horizontal, plus a max-width small enough to wrap.

**How to apply:** Any popover/tooltip that must survive 320–375px viewports: place it above/below the trigger, cap width (~260px), keep `collisionPadding`.

**Rule 3 (native):** RN `measureInWindow` on a container ref can return the trigger's own x or width 0 on some platforms. For popup geometry: take width from `onLayout` (reliable), position from the trigger's own measurement, and always hard-clamp `left` to `[margin, screenWidth - width - margin]`.
