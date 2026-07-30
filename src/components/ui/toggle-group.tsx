"use client";

/**
 * A labelled row of toggle chips for one filter dimension.
 *
 * Chips rather than a `<select multiple>`: with at most five options per dimension
 * the whole state is visible at a glance, which matters when several dimensions
 * combine and a reader needs to know why a chart looks empty.
 *
 * Rendered as real checkboxes so keyboard and screen-reader behaviour comes for
 * free; the visible chip is the styled label.
 */

interface ToggleOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown alongside, e.g. attempts available. */
  hint?: string;
}

interface ToggleGroupProps<T extends string> {
  legend: string;
  options: readonly ToggleOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}

export function ToggleGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
}: ToggleGroupProps<T>) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-ink-muted">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);

          return (
            <label
              key={option.value}
              className={[
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
                "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
                isSelected
                  ? "border-transparent bg-accent text-white"
                  : "border-hairline text-ink-secondary hover:border-axis",
              ].join(" ")}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => onToggle(option.value)}
              />
              {option.label}
              {option.hint && (
                <span
                  className={
                    isSelected ? "ml-1.5 opacity-75" : "ml-1.5 text-ink-muted"
                  }
                >
                  {option.hint}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
