import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { matchesFuzzy } from "../../domain/catalog";
import type { SelectOption } from "../../domain/registry";

type SearchableSelectProps = {
  allLabel: string;
  ariaLabel: string;
  emptyMessage: string;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder: string;
  value: string | null;
};

export function SearchableSelect({
  allLabel,
  ariaLabel,
  emptyMessage,
  onChange,
  options,
  placeholder,
  value,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        matchesFuzzy(option.label, query, option.searchText),
      ),
    [options, query],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (nextValue: string | null) => {
      onChange(nextValue);
      setIsOpen(false);
      setQuery("");
    },
    [onChange],
  );

  return (
    <div className="searchable-select" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`searchable-select-trigger${isOpen ? " searchable-select-trigger-open" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className={selectedOption ? "" : "searchable-select-placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="searchable-select-chevron">▾</span>
      </button>

      {isOpen ? (
        <div className="searchable-select-menu">
          <input
            aria-label={ariaLabel}
            className="searchable-select-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${ariaLabel.toLowerCase()}...`}
            ref={inputRef}
            value={query}
          />
          <div className="searchable-select-options" role="listbox">
            <button
              className={`searchable-select-option${value === null ? " searchable-select-option-active" : ""}`}
              onClick={() => handleSelect(null)}
              type="button"
            >
              {allLabel}
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  className={`searchable-select-option${option.value === value ? " searchable-select-option-active" : ""}`}
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="searchable-select-empty">{emptyMessage}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
