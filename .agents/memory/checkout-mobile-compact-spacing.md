---
name: Checkout mobile compact spacing system
description: The agreed compact spacing scale for web checkout at ≤767px and the textarea line-height gotcha
---

# Checkout mobile compact spacing (≤767px)

Web checkout step 1 (Delivery Details) uses one consistent compact scale via Tailwind `max-md:` variants (Tailwind v4; matches the `useIsMobile()` 768px breakpoint):

- Card vertical padding: `max-md:py-3` (horizontal stays 16px — page gutters must not change)
- Card headings: `max-md:mb-3`; major section gaps (`mb-6`): `max-md:mb-4`
- Field rows (`mb-4`/`mb-3.5`): `max-md:mb-3`; label→input (`space-y-2`): `max-md:space-y-1.5`
- Card-to-card margins: `max-md:mb-3`
- Step-1 container footer clearance: `max-md:pb-24` (verified 52px gap above the sticky footer with no safe-area inset; iOS safe-area worst case leaves ~26px — do not go below pb-24)

**Why:** the "everything below `lg` is mobile" convention means naive spacing edits also change tablet (768–1023); the spec required tablet/desktop pixel-identical. Future mobile checkout compaction (preference rows, summary) should reuse this exact scale, not invent new values.

**How to apply:** add `max-md:` variants alongside existing classes; never replace the base class (tablet keeps it).

**Responsive dual-copy pattern:** when mobile needs different copy than desktop on the same control (e.g. "Apple" vs "Continue with Apple"), keep ONE element with two spans (`md:hidden` / `hidden md:inline`) rather than duplicating the button — preserves single testids, handlers, refs, and analytics with zero duplicate-event risk.

**Textarea height gotcha:** shadcn Input/Textarea are `text-base md:text-sm`, so mobile line-height is 24px, not 20px. A rows=3 textarea is ~90px on mobile (not ~78px); rows=2 ≈ 64px ≈ the "25% shorter" target. Compute height targets with the mobile line-height, and prefer responsive `rows={isMobile ? … : …}` over forcing `h-[…]`.
