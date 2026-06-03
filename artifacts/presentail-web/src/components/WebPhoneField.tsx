import { useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import type { Value as PhoneValue } from "react-phone-number-input";

type Props = {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  label: string;
  required?: boolean;
  showError?: boolean;
  errorMessage?: string | null;
  "data-testid"?: string;
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
}: Props) {
  const [touched, setTouched] = useState(false);

  const isInvalid = !!value && !isValidPhoneNumber(value);
  const showInlineError = (touched || showError) && isInvalid && !!errorMessage;

  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">
        {label}
        {required ? <span className="text-destructive ms-0.5"> *</span> : null}
      </label>
      {/* dir="ltr" keeps the picker LTR even inside RTL page layouts.
          React's synthetic onBlur bubbles from child inputs, so placing it
          on the wrapper fires whenever the phone input or country select
          loses focus — giving us blur-time validation without patching the
          library's internal input element directly. */}
      <div dir="ltr" className="pi-phone-wrap" onBlur={() => setTouched(true)}>
        <PhoneInput
          international
          defaultCountry={defaultCountry as any}
          value={(value as PhoneValue) || undefined}
          onChange={(v) => onChange(v ?? "")}
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
