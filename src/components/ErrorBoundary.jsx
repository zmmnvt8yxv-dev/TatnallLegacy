import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("UI_RENDER_ERROR", { error, componentStack: info?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="section-card">
          <h2 className="section-title">Something went wrong</h2>
          <p>Try reloading the page. If it keeps happening, share the UI_RENDER_ERROR log.</p>
          <button type="button" className="tag" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
