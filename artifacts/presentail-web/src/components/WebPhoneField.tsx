import { useEffect, useMemo, useRef, useState } from "react";
import PhoneInput, {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumber,
} from "react-phone-number-input";
import type { Country, Value as PhoneValue } from "react-phone-number-input";
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
  /**
   * Called with the ISO-3166 country currently displayed by the phone field's
   * flag/prefix picker (and its dial code, e.g. "961"), including once on
   * mount with the initial country. This is the SAME state that renders the
   * visible prefix, so consumers (e.g. payment routing) can never disagree
   * with what the UI shows. `undefined` means the picker is in the
   * "international / unknown" state.
   */
  onCountryChange?: (country: string | undefined, dialCode: string | undefined) => void;
};

function safeDialCode(country: string | undefined): string | undefined {
  if (!country) return undefined;
  try {
    return getCountryCallingCode(country as Country);
  } catch {
    return undefined;
  }
}

function deriveInitialCountry(value: string, defaultCountry: string): string | undefined {
  // A prefilled E.164 value decides the displayed country (PhoneInput derives
  // it the same way); otherwise the picker starts on defaultCountry.
  if (value) {
    try {
      const parsed = parsePhoneNumber(value);
      if (parsed?.country) return parsed.country;
    } catch {
      /* fall through to defaultCountry */
    }
  }
  return defaultCountry || undefined;
}

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
  onCountryChange,
}: Props) {
  const filteredCountries = useMemo(
    () => getCountries().filter((c) => !(PHONE_COUNTRY_BLOCKLIST as readonly string[]).includes(c)),
    [],
  );

  // Freeze the defaultCountry so re-renders from the parent (e.g. each
  // keystroke in Checkout) never snap the picker back to the geo-detected
  // country after the user has chosen a different one.
  //
  // The ref is allowed to update exactly once: when the frozen value is still
  // the undetected fallback ("LB") and the parent now provides a geo-resolved
  // country. This lets the one-time auto-detection propagate before the user
  // has interacted, while subsequent changes are ignored.
  const frozenDefaultCountryRef = useRef<string>(defaultCountry);
  if (
    frozenDefaultCountryRef.current === "LB" &&
    defaultCountry !== "LB" &&
    defaultCountry !== ""
  ) {
    frozenDefaultCountryRef.current = defaultCountry;
  }
  const frozenDefaultCountry = frozenDefaultCountryRef.current;

  // Mirror of the country the picker currently displays. Initialised from the
  // prefilled value (or frozenDefaultCountry) and kept in sync via PhoneInput's
  // own onCountryChange, so it can never diverge from the visible flag/prefix.
  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(() =>
    deriveInitialCountry(value, frozenDefaultCountry),
  );
  // Notify parent on mount and on every change. onCountryChange is treated
  // like onChange — stable reference not required in deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onCountryChange?.(selectedCountry, safeDialCode(selectedCountry));
  }, [selectedCountry]);

  const [touched, setTouched] = useState(false);
  // hasTyped tracks whether the user has actually typed into the text field.
  // It is set via the native onInput event on the wrapper, which only bubbles
  // from the <input> element (keyboard entry) — NOT from the country <select>
  // (which fires "change", not "input"). This prevents a country-picker
  // interaction (which triggers onBlur) from prematurely revealing the error.
  const [hasTyped, setHasTyped] = useState(false);

  const isInvalid = !!value && !isValidPhoneNumber(value);
  // A required-but-empty value only surfaces after an explicit submit attempt
  // (showError) — never from mere blur/typing — so the field stays quiet
  // until the user actually tries to continue.
  const isMissing = !!required && !value;
  const showInlineError =
    !!errorMessage &&
    (((showError || (touched && hasTyped)) && isInvalid) || (showError && isMissing));
  const errorElementId = testId ? `${testId}-error` : undefined;

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
        className={showInlineError ? "pi-phone-wrap pi-phone-error" : "pi-phone-wrap"}
        onBlur={() => setTouched(true)}
        onInput={() => setHasTyped(true)}
      >
        <PhoneInput
          international
          defaultCountry={frozenDefaultCountry as any}
          value={(value as PhoneValue) || undefined}
          onChange={(v) => onChange(v ?? "")}
          onCountryChange={(c) => setSelectedCountry(c ?? undefined)}
          countries={filteredCountries}
          data-testid={testId}
          numberInputProps={{
            "aria-invalid": showInlineError || undefined,
            "aria-describedby": showInlineError ? errorElementId : undefined,
          }}
        />
      </div>
      {showInlineError ? (
        <p
          id={errorElementId}
          className="text-sm text-destructive mt-1.5"
          data-testid={errorElementId}
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
