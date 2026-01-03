import React from "react";

export default function ErrorState({ message }) {
  return (
    <div className="state-card error">
      <div className="state-title">We hit a snag</div>
      <div className="state-body">{message || "Unable to load league data."}</div>
    </div>
  );
}
