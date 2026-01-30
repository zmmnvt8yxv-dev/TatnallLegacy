import React from "react";
import { Search, X } from "lucide-react";

export default function SearchBar({ value, onChange, placeholder = "Search players..." }) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[var(--bg-card-hover)] flex items-center justify-center hover:bg-[var(--text-muted)] hover:text-white transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
