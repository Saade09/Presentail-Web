---
name: PhoneField focus on mobile
description: How to programmatically focus the mobile PhoneField (react-native-phone-number-input)
---

# Focusing the mobile PhoneField

`react-native-phone-number-input`'s `PhoneInput` is a **class component** whose
ref instance exposes only `getCountryCode`, `getCallingCode`, `isValidNumber`,
`onSelect`, `getNumberAfterPossiblyEliminatingZero`, `onChangeText` — there is
**no `focus()` method** and no exposed handle to the inner `TextInput`.

**To focus it programmatically** (e.g. Return-key field chaining from a previous
input), pass a ref into the underlying `TextInput` through the `textInputProps`
prop: the lib spreads `{...textInputProps}` last onto its `<TextInput>`, so a
`ref` key inside that object is picked up by `React.createElement` as the
element ref. The shared `PhoneField` wrapper (`artifacts/presentail/components/
PhoneField.tsx`) exposes this as an optional `focusRef?: RefObject<TextInput>`.

**Why:** chaining recipient last name -> phone on the mobile checkout requires a
focusable phone input, and the library gives no other way in.

**How to apply:** `<PhoneField focusRef={someInputRef} ... />`, then
`someInputRef.current?.focus()`. The `textInputProps` object needs an
`as TextInputProps` cast because RN's `TextInputProps` type doesn't include
`ref`.
