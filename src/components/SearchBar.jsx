import React from "react";

export default function SearchBar({ value, onChange, placeholder = "Search players..." }) {
  return (
    <div className="search-bar">
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
