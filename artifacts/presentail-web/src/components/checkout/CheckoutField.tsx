import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Label text (may contain responsive spans, e.g. short/long address labels). */
  label: ReactNode;
  /** Associates the label with the control when the control has a matching id. */
  htmlFor?: string;
  /** Renders the required asterisk 4px after the label, baseline-aligned. */
  required?: boolean;
  /** Localized required-status text announced as part of a fieldset legend. */
  requiredText?: ReactNode;
  /** Optional element rendered after the label + asterisk (e.g. the phone info icon). */
  labelTrailing?: ReactNode;
  /** Extra classes on the group wrapper (e.g. width constraints). Never spacing. */
  className?: string;
  /**
   * Localized inline error message shown under the control after a failed
   * "Continue" attempt. Pass `null`/`undefined` when the field is valid —
   * the row is not rendered at all, so the 24px field rhythm is unchanged.
   */
  error?: ReactNode;
  /**
   * DOM id for the error message element. Pass the same value to the
   * control's `aria-describedby` (only when the error is showing) so screen
   * readers announce the message. Required when `error` is provided.
   */
  errorId?: string;
  /** Test id for the error message element (e.g. "error-recipient-name"). */
  errorTestId?: string;
  /** Render this field group as a semantic fieldset with a legend. */
  asFieldset?: boolean;
  /** Accessible description for a semantic fieldset. */
  ariaDescribedBy?: string;
  /** Exposes validation state for a semantic fieldset. */
  ariaInvalid?: boolean;
  children: ReactNode;
};

/**
 * Inline validation error message for a checkout field.
 *
 * Visual style intentionally matches the phone field's existing inline error
 * (text-sm text-destructive mt-1.5) so all Step-1 error messages look
 * identical. Exported for the sender-details fields, which don't use the
 * CheckoutField wrapper.
 *
 * Screen readers pick the message up via the control's `aria-describedby`
 * pointing at `id` — do not add role="alert" here, or the message would be
 * announced twice.
 */
export function CheckoutFieldError({
  id,
  testId,
  children,
}: {
  id?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="text-sm text-destructive mt-1.5" data-testid={testId}>
      {children}
    </p>
  );
}
/**
 * Shared field group for the checkout "Recipient Details" section.
 *
 * Owns the vertical rhythm so every field is identical:
 * - label row → control: 8px (mb-2); 6px on phones (max-md:mb-1.5)
 * - control → next label row: 24px (mb-6 on the group); 16px on phones
 *   (max-md:mb-4) — part of the compact mobile checkout spacing (≤767px);
 *   tablet (md–lg) keeps the desktop rhythm
 * - label: text-sm, font-medium, 20px line-height (leading-5)
 * - required asterisk: 4px after the label (ms-1), baseline-aligned
 *
 * Validation/error messages rendered by the control (e.g. the phone field's
 * inline error) or via the `error` prop live inside the group, so the 24px
 * gap to the next field is never disturbed. The label row is a flex row with
 * items-center so trailing elements (info icon) stay vertically centered
 * with the label.
 */
export function CheckoutField({
  label,
  htmlFor,
  required,
  requiredText,
  labelTrailing,
  className,
  error,
  errorId,
  errorTestId,
  asFieldset,
  ariaDescribedBy,
  ariaInvalid,
  children,
}: Props) {
  const Wrapper = asFieldset ? "fieldset" : "div";

  return (
    <Wrapper
      className={cn("mb-6 max-md:mb-4", asFieldset && "border-0 p-0", className)}
      {...(asFieldset
        ? {
            "aria-describedby": ariaDescribedBy,
            "aria-invalid": ariaInvalid || undefined,
          }
        : {})}
    >
      {asFieldset ? (
        <legend className="mb-2 max-md:mb-1.5 text-sm font-medium leading-5">
          {label}
          {required ? (
            <>
              <span className="text-destructive ms-1" aria-hidden="true">*</span>
              {requiredText ? <span className="sr-only"> ({requiredText})</span> : null}
            </>
          ) : null}
        </legend>
      ) : (
        <div className="mb-2 max-md:mb-1.5 flex items-center">
          <label htmlFor={htmlFor} className="text-sm font-medium leading-5">
            {label}
            {required ? <span className="text-destructive ms-1">*</span> : null}
          </label>
          {labelTrailing}
        </div>
      )}
      {children}
      {error ? (
        <CheckoutFieldError id={errorId} testId={errorTestId}>
          {error}
        </CheckoutFieldError>
      ) : null}
    </Wrapper>
  );
}
