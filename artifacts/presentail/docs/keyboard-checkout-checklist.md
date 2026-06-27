# Mobile Checkout — Keyboard & Switch-Access Checklist

This checklist verifies that every interactive element in the Expo mobile checkout
(`app/checkout.tsx`) can be reached and activated without a touch screen — either
via a paired Bluetooth hardware keyboard on iOS, or via iOS Switch Control
(single-switch scanning).

Run this against an iOS Simulator or a physical device with a BT keyboard attached.

---

## Setup

### Bluetooth keyboard (iOS Simulator)
1. Open Xcode → Xcode menu → Open Developer Tool → Simulator.
2. Build and install the Expo dev build (`eas build --platform ios --profile development`).
3. Attach your BT keyboard. The software keyboard will not appear; the hardware keyboard drives all text input.
4. In the Simulator, use **Tab** to move focus forward between focusable elements.
5. Press **Space** or **Return** to activate the focused button/Pressable.
6. For modals, **Escape** should dismiss them (maps to `onRequestClose`).

### Switch Control (VoiceOver/Switch Access)
1. Settings → Accessibility → Switch Control → Switches → add a single switch mapped to "Select Item".
2. Settings → Accessibility → Switch Control → Scanning Style → "Auto Scanning".
3. Launch the checkout. The scanner moves through focusable elements; verify each one below is announced clearly and can be activated.

---

## Step 0 — Customize

| # | Element | How to reach | Expected result |
|---|---------|--------------|-----------------|
| 1 | **Recipient First Name** (`cardTo`) field | Tab | Focus ring visible; VoiceOver announces "Recipient First Name, text field" |
| 2 | Type in field 1 | Type on BT keyboard | Characters appear correctly |
| 3 | **Card Message** (`cardMessage`) multiline field | Tab | Announced as text field; Return key inserts newline (not submit) |
| 4 | **Recipient Last Name** (`cardFrom`) field | Tab from card message | Focus moves; announced correctly |
| 5 | **QR Link** field | Tab | `keyboardType="url"` — URL keyboard layout shown; announced as text field |
| 6 | **Continue to Delivery** button | Tab to button, Space/Return | Advances to Step 1 |

---

## Step 1 — Delivery Details

| # | Element | How to reach | Expected result |
|---|---------|--------------|-----------------|
| 7 | **Recipient First Name** field | Tab | Announced "Recipient First Name, text field, required"; error state reads "required" |
| 8 | **Recipient Last Name** field | Tab (Return from field 7 with `onSubmitEditing`) | Focus jumps to next field |
| 9 | **Recipient Phone** (`PhoneField`) | Tab | Country-flag button and number input both reachable; announced as phone field |
| 10 | Country picker button (inside PhoneField) | Tab to flag button, Space/Return | Opens country list; Escape/Back dismisses it |
| 11 | **"I don't know the address"** toggle | Tab | Announced as "I don't know the address, button" or checkbox; Space toggles it |
| 12 | **Delivery Details** multiline field | Tab (only when address toggle is off) | Reachable; Return inserts newline |
| 13 | **Sender First Name** field | Tab | Announced correctly |
| 14 | **Sender Last Name** field | Tab | Announced correctly |
| 15 | **Sender WhatsApp** (PhoneField) | Tab | Both country picker and input reachable |
| 16 | **Sender Email** field | Tab | `keyboardType="email-address"` — `@` key visible; announced as text field |
| 17 | **Delivery mode — Standard** Pressable | Tab | `accessibilityRole="button"` — announced; Space selects it |
| 18 | **Delivery mode — Express** Pressable | Tab | Announced; Space selects it |
| 19 | **DateStrip — day tiles** (scrollable row) | Tab through tiles | Each tile announced as e.g. "Monday, June 1, 2026, button"; selected tile announces "selected" |
| 20 | **DateStrip — More (calendar) button** | Tab to "More", Space/Return | Opens full-month modal; VoiceOver announces "calendar dialog" |
| 21 | **Calendar modal — Previous month** | Tab inside modal | Announced "Previous month, button"; Space navigates; disabled state announced when at earliest month |
| 22 | **Calendar modal — month/year header** | Tab | Announced as heading e.g. "June 2026" |
| 23 | **Calendar modal — Next month** | Tab | Announced "Next month, button" |
| 24 | **Calendar modal — day cells** | Tab through cells | Each announced as e.g. "Monday, June 1, button"; past/future-beyond-90-days cells are announced as "dimmed" or "unavailable" |
| 25 | **Calendar modal — select a date** | Tab to target day, Space | Modal closes; DateStrip updates selected date |
| 26 | **Calendar modal — dismiss** | Escape key / tap backdrop | Modal closes; focus returns to "More" button |
| 27 | **SlotPicker — time-slot tiles** | Tab | Each tile announced as e.g. "9:00 AM – 2:00 PM, button"; selected tile announces "selected"; past tiles announce "dimmed" / "unavailable" |
| 28 | **Select a time slot** | Tab to tile, Space | Tile highlighted; selection persists |
| 29 | **Continue to Payment** button | Tab | Announced; Space/Return advances (validates required fields first) |

---

## Step 2 — Payment

| # | Element | How to reach | Expected result |
|---|---------|--------------|-----------------|
| 30 | **Order Notes** multiline field | Tab | Announced as text field; Return inserts newline |
| 31 | **Pay by Card** radio row (PayOption Pressable) | Tab | Announced as "Pay by card, button"; Space selects it; Stripe CardField becomes visible |
| 32 | **Stripe CardField** | Tab | Receives keyboard focus; card number entry works via BT keyboard |
| 33 | **Apple Pay** radio row | Tab | Announced "Apple Pay, button" |
| 34 | **Google Pay** radio row | Tab | Announced "Google Pay, button" |
| 35 | **PayPal** radio row | Tab | Announced "PayPal, button" |
| 36 | **Whish** radio row | Tab | Announced "Whish, button" |
| 37 | **Mamo** radio row | Tab | Announced "Mamo Pay, button" |
| 38 | **Western Union** radio row | Tab | Announced "Western Union, button" |
| 39 | **Email for receipt** field | Tab | Announced; `keyboardType="email-address"` |
| 40 | **Have a coupon?** toggle | Tab | Announced as button; Space reveals coupon field |
| 41 | **Coupon code** field (when visible) | Tab | Announced; Return submits coupon |
| 42 | **Place Order / Pay button** (`PaymentSubmitButton`) | Tab | Announced with full label e.g. "Pay with Apple Pay, button"; when paying, announced as "Processing…"; disabled state announced when form is incomplete |

---

## Known gaps (no hardware keyboard path today)

| Gap | Detail | Severity |
|-----|--------|----------|
| **Stripe CardField keyboard focus** | ~~`@stripe/stripe-react-native`'s `CardField` is a native UIKit view; it accepts keyboard input once focused but is not in the RN focus order when using Tab from outside. Users must swipe-to-focus or VoiceOver-navigate into it.~~ **Resolved:** `PaymentStep` now holds a `cardFieldRef = useRef<CardFieldInput.Methods>()` and calls `cardFieldRef.current?.focus()` (with a 150 ms delay to let the native view mount) inside `tap("card")`. When a keyboard-only shopper presses Space/Return on the "Pay by card" row, the `CardField` receives focus automatically and card-number entry works via BT keyboard without any touch interaction. | ~~Medium~~ **Closed** |
| **District/city picker** | The country/district dropdowns are rendered as `Picker` (iOS UIPickerView). Hardware-keyboard arrow keys scroll options in the simulator; VoiceOver + swipe works on device. No explicit `accessibilityLabel` is set on the picker rows yet. | Low — picker already responds to arrow keys |
| **PhoneField country list modal** | Uses `react-native-phone-number-input`'s built-in country picker which is a third-party FlatList modal. Focus trapping inside the modal is not guaranteed across RN versions. | Low — affects the country-code selection step only |
| **TextInput Tab-chaining** | `returnKeyType="next"` is now set on single-line fields via the `Field` component. However, `onSubmitEditing` refs are only wired for the Delivery step's first two fields. Other fields require Tab to advance. | Low — Tab always works; Return-key chaining is a UX polish item |

---

## Running the automated RNTL suite

The RNTL tests in `artifacts/presentail/tests/SlotPicker.test.tsx` and
`artifacts/presentail/tests/DateStrip.test.tsx` assert that every `Pressable`
tile carries:

- `accessibilityRole="button"`
- a non-empty `accessibilityLabel`
- `accessibilityState.disabled` matching the tile's actual enabled/disabled state
- `accessibilityState.selected` matching whether the tile is the active selection

Run them with:

```bash
pnpm --filter @workspace/presentail run test
```

These tests catch regressions silently introduced by refactors. They cannot
replace on-device VoiceOver/keyboard testing of the full flow.

---

## References

- [React Native Accessibility docs](https://reactnative.dev/docs/accessibility)
- [iOS Switch Control](https://support.apple.com/en-us/111896)
- [Expo Accessibility guide](https://docs.expo.dev/guides/accessibility/)
