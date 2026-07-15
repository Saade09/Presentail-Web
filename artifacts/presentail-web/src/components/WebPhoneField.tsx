import { useEffect, useMemo, useState } from "react";
import PhoneInput, { getCountries, isValidPhoneNumber } from "react-phone-number-input";
import type { Value as PhoneValue } from "react-phone-number-input";
import { PHONE_COUNTRY_BLOCKLIST } from "@workspace/catalog-data";

export type Props = {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  /** Rendered as a `<label>` above the input. Omit (or pass "") to skip the label element entirely — useful when an external heading already provides the label. */
  label?: string;
  required?: boolean;
  showError?: boolean;
  errorMessage?: string | null;
  "data-testid"?: string;
  /**
   * Called whenever the phone validity changes. Receives `true` when the
   * current value is non-empty AND passes libphonenumber validation;
   * `false` when the value is empty or invalid. Use this instead of
   * importing `isValidPhoneNumber` in the parent so the phone library
   * stays inside this module's dynamic code-split boundary.
   */
  onValidityChange?: (isNonEmptyAndValid: boolean) => void;
};

export function WebPhoneField({
  value,
  onChange,
  defaultCountry = "LB",
  label,
  required,
  showError,
  errorMessage,
  "data-testid": testId,
  onValidityChange,
}: Props) {
  const filteredCountries = useMemo(
    () => getCountries().filter((c) => !(PHONE_COUNTRY_BLOCKLIST as readonly string[]).includes(c)),
    [],
  );

  const [touched, setTouched] = useState(false);
  // hasTyped tracks whether the user has actually typed into the text field.
  // It is set via the native onInput event on the wrapper, which only bubbles
  // from the <input> element (keyboard entry) — NOT from the country <select>
  // (which fires "change", not "input"). This prevents a country-picker
  // interaction (which triggers onBlur) from prematurely revealing the error.
  const [hasTyped, setHasTyped] = useState(false);

  const isInvalid = !!value && !isValidPhoneNumber(value);
  const showInlineError = (showError || (touched && hasTyped)) && isInvalid && !!errorMessage;

  const isNonEmptyAndValid = !!value && isValidPhoneNumber(value);
  // Notify parent whenever validity changes. onValidityChange is treated like
  // onChange — stable reference not required in deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onValidityChange?.(isNonEmptyAndValid); }, [isNonEmptyAndValid]);

  return (
    <div>
      {label ? (
        <label className="text-sm font-medium block mb-2">
          {label}
          {required ? <span className="text-destructive ms-0.5"> *</span> : null}
        </label>
      ) : null}
      {/* dir="ltr" keeps the picker LTR even inside RTL page layouts.
          React's synthetic onBlur bubbles from child inputs, so placing it
          on the wrapper fires whenever the phone input or country select
          loses focus — giving us blur-time validation without patching the
          library's internal input element directly.
          onInput is used to set hasTyped: standard keyboard input in the
          text field triggers the native "input" event, which bubbles here.
          Country-picker selection normally does not emit an "input" event
          on the text field, keeping hasTyped false when only the flag is
          changed. If a browser quirk does fire an extra input event, the
          worst case is one premature validation — which is still better
          than the pre-existing state of always showing the error on load. */}
      <div
        dir="ltr"
        className="pi-phone-wrap"
        onBlur={() => setTouched(true)}
        onInput={() => setHasTyped(true)}
      >
        <PhoneInput
          international
          defaultCountry={defaultCountry as any}
          value={(value as PhoneValue) || undefined}
          onChange={(v) => onChange(v ?? "")}
          countries={filteredCountries}
          data-testid={testId}
        />
      </div>
      {showInlineError ? (
        <p
          className="text-sm text-destructive mt-1.5"
          data-testid={testId ? `${testId}-error` : undefined}
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
