import React from "react";

export default function LoadingState({ label = "Loading data..." }) {
  return (
    <div className="state-card">
      <div className="state-title">{label}</div>
      <div className="state-body">Please wait while we fetch the latest league data.</div>
    </div>
  );
}
