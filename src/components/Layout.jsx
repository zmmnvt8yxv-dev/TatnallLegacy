import React from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Summary" },
  { to: "/matchups", label: "Matchups" },
  { to: "/transactions", label: "Transactions" },
  { to: "/standings", label: "Standings" },
];

export default function Layout({ children }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-title">Tatnall Legacy League</div>
          <div className="brand-subtitle">League Encyclopedia</div>
        </div>
        <nav className="site-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="site-main">{children}</main>
    </div>
  );
}
