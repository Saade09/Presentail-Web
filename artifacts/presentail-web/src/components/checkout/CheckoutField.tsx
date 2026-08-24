import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Label text (may contain responsive spans, e.g. short/long address labels). */
  label: ReactNode;
  /** Associates the label with the control when the control has a matching id. */
  htmlFor?: string;
  /** Renders the required asterisk 4px after the label, baseline-aligned. */
  required?: boolean;
  /** Optional element rendered after the label + asterisk (e.g. the phone info icon). */
  labelTrailing?: ReactNode;
  /** Extra classes on the group wrapper (e.g. width constraints). Never spacing. */
  className?: string;
  children: ReactNode;
};

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
 * inline error) live inside the group, so the 24px gap to the next field is
 * never disturbed. The label row is a flex row with items-center so trailing
 * elements (info icon) stay vertically centered with the label.
 */
export function CheckoutField({
  label,
  htmlFor,
  required,
  labelTrailing,
  className,
  children,
}: Props) {
  return (
    <div className={cn("mb-6 max-md:mb-4", className)}>
      <div className="mb-2 max-md:mb-1.5 flex items-center">
        <label htmlFor={htmlFor} className="text-sm font-medium leading-5">
          {label}
          {required ? <span className="text-destructive ms-1">*</span> : null}
        </label>
        {labelTrailing}
      </div>
      {children}
    </div>
  );
}
