---
name: cmdk combobox gotchas (web)
description: Pitfalls when building searchable comboboxes from Radix Popover + cmdk in presentail-web
---
- cmdk lowercases `CommandItem` `value` internally and passes that lowercased string to `onSelect` — never map it back to data; capture the option in a closure instead.
- **Why:** city ids/names are case-sensitive keys downstream; the lowercased arg silently mismatched them.
- Use `shouldFilter={false}` + manual trimmed/lowercased filtering when matching localized display names (Arabic etc.) — cmdk's built-in scorer is unpredictable for non-Latin text.
- Panel must use `w-[var(--radix-popover-trigger-width)]` for a trigger-width menu; checkout overlays use `z-[90]` to sit above the Order Summary layer.
- jsdom tests need `Element.prototype.scrollIntoView` stubbed (cmdk scrolls the highlighted row); test-setup only stubs ResizeObserver.
