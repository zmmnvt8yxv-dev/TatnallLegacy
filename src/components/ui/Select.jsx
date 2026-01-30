import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check, Search } from "lucide-react";

// Simple styled select wrapper
const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <div className="relative inline-block">
    <select
      ref={ref}
      className={cn(
        "appearance-none w-full px-4 py-2.5 pr-10 rounded-lg text-sm",
        "bg-[var(--bg-card)] border border-[var(--border)]",
        "text-[var(--text-primary)]",
        "transition-all duration-150",
        "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]",
        "hover:border-[var(--border-strong)]",
        "cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
  </div>
));
Select.displayName = "Select";

// Select option
const SelectOption = React.forwardRef(({ className, ...props }, ref) => (
  <option
    ref={ref}
    className={cn(
      "bg-[var(--bg-secondary)] text-[var(--text-primary)]",
      className
    )}
    {...props}
  />
));
SelectOption.displayName = "SelectOption";

// Custom dropdown select with search (for owner selects, etc.)
function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const needle = search.toLowerCase();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(needle)
    );
  }, [options, search]);

  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-lg text-sm",
          "bg-[var(--bg-card)] border border-[var(--border)]",
          "text-left transition-all duration-150",
          "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]",
          "hover:border-[var(--border-strong)]",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          isOpen && "border-[var(--accent)] ring-2 ring-[var(--accent-light)]"
        )}
      >
        <span className={selectedOption ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-[var(--text-muted)] transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute z-50 w-full mt-1 py-1 rounded-lg",
          "bg-[var(--bg-secondary)] border border-[var(--border)]",
          "shadow-lg max-h-64 overflow-hidden",
          "animate-fadeIn"
        )}>
          {/* Search input */}
          <div className="px-2 pb-1 border-b border-[var(--border)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "w-full pl-8 pr-3 py-2 text-sm rounded-md",
                  "bg-[var(--bg-card)] border border-[var(--border)]",
                  "text-[var(--text-primary)]",
                  "focus:outline-none focus:border-[var(--accent)]",
                  "placeholder:text-[var(--text-muted)]"
                )}
                autoFocus
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--text-muted)] text-center">
                No results found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-4 py-2 text-sm text-left",
                    "transition-colors duration-100",
                    "hover:bg-[var(--bg-card-hover)]",
                    option.value === value
                      ? "text-[var(--accent)] bg-[var(--accent-light)]"
                      : "text-[var(--text-primary)]"
                  )}
                >
                  <span>{option.label}</span>
                  {option.value === value && (
                    <Check className="w-4 h-4" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { Select, SelectOption, SearchableSelect };
