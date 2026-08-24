import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Lock, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

export type LocationOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

type LocationComboboxProps = {
  /** DOM id for the trigger so a <label htmlFor> can be associated with it. */
  id?: string;
  /** Currently selected city `name` ("" when nothing is selected yet). */
  value: string;
  /** Full city list for the country — both active and inactive rows. */
  options: LocationOption[];
  /** Called with the city `name` when an available row is chosen. */
  onSelect: (name: string) => void;
  disabled?: boolean;
  /** Text shown in the trigger when there is no committed selection. */
  placeholder: string;
  /** Localized placeholder for the sticky search input. */
  searchPlaceholder: string;
  /** Localized empty state shown when the search matches nothing. */
  emptyText: string;
  /** Localized heading for the unavailable group (rendered uppercase). */
  unavailableLabel: string;
  /** Extra classes for the trigger button (e.g. invalid red-border styling). */
  triggerClassName?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "data-testid"?: string;
};

/**
 * Searchable location picker for the checkout "Governorate / Emirate /
 * District" field. Replaces the old full-height Radix Select with a compact
 * combobox: trigger-width anchored panel, sticky search, internal scrolling,
 * available-first ordering and a single locked "currently unavailable" group.
 *
 * Selection state is fully controlled by the parent — Escape / outside click
 * close without changing it, and the search query resets on every open/close
 * so reopening always shows the full list with the current selection.
 */
export function LocationCombobox({
  id,
  value,
  options,
  onSelect,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyText,
  unavailableLabel,
  triggerClassName,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  "data-testid": testId = "select-district",
}: LocationComboboxProps) {
  const { cityName } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const labelled = useMemo(
    () =>
      options.map((o) => ({
        ...o,
        label: cityName(o.id, o.name),
        inactive: o.isActive === false,
      })),
    [options, cityName],
  );

  const selected = labelled.find((o) => o.name === value);

  // Manual filtering (shouldFilter={false}) so matching is predictable:
  // case-insensitive, whitespace-trimmed, against the localized labels of
  // both available and unavailable rows, preserving the incoming order.
  const q = query.trim().toLowerCase();
  const matched = q
    ? labelled.filter((o) => o.label.toLowerCase().includes(q))
    : labelled;
  const available = matched.filter((o) => !o.inactive);
  const unavailable = matched.filter((o) => o.inactive);
  const noMatches = matched.length === 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Clearing on both open and close guarantees a fresh full list with the
    // existing selection visible every time the menu is opened.
    setQuery("");
  };

  const renderOption = (o: (typeof labelled)[number]) => {
    const isSelected = !o.inactive && o.name === value;
    return (
      <Command.Item
        key={o.id}
        value={o.id}
        disabled={o.inactive}
        onSelect={() => {
          onSelect(o.name);
          setOpen(false);
        }}
        data-testid={`option-district-${o.id}`}
        className={cn(
          "flex min-h-[46px] select-none items-center gap-2 rounded-[8px] px-3 py-2 text-sm outline-none",
          o.inactive
            ? // contrast-ok: disabled option — WCAG 1.4.3 inactive UI exception,
              // but muted-foreground on white passes AA anyway (readable grey).
              "cursor-default text-muted-foreground data-[disabled=true]:pointer-events-none"
            : "cursor-pointer text-foreground data-[selected=true]:bg-secondary",
          isSelected &&
            "bg-[hsl(190_45%_94%)] data-[selected=true]:bg-[hsl(190_45%_90%)]",
        )}
      >
        <span className="flex-1 break-words text-start">{o.label}</span>
        {isSelected && (
          <Check
            className="ms-auto h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
            data-testid="icon-district-check"
          />
        )}
        {o.inactive && (
          <Lock
            className="ms-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
            aria-hidden="true"
            data-testid={`icon-district-lock-${o.id}`}
          />
        )}
      </Command.Item>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedby}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-sm border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName,
          )}
        >
          <span
            className={cn(
              "line-clamp-1 text-start",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-[90] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[14px] border-border p-0 shadow-lg"
      >
        <Command shouldFilter={false} defaultValue={selected?.id}>
          {/* Sticky search — lives outside the scrolling list */}
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              data-testid="input-district-search"
              className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto overscroll-contain p-1.5">
            {noMatches ? (
              <div
                className="py-6 text-center text-sm text-muted-foreground"
                data-testid="text-district-empty"
              >
                {emptyText}
              </div>
            ) : (
              <>
                {available.map(renderOption)}
                {unavailable.length > 0 && (
                  <Command.Group
                    heading={unavailableLabel}
                    data-testid="group-district-unavailable"
                    className={cn(
                      available.length > 0 &&
                        "mt-1.5 border-t border-border pt-1",
                      "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground",
                    )}
                  >
                    {unavailable.map(renderOption)}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
