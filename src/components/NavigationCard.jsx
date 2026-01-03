import React from "react";
import { Link } from "react-router-dom";

export default function NavigationCard({ to, title, description }) {
  return (
    <Link className="nav-card" to={to}>
      <div className="nav-card-title">{title}</div>
      <div className="nav-card-description">{description}</div>
      <div className="nav-card-link">Open →</div>
    </Link>
  );
}
