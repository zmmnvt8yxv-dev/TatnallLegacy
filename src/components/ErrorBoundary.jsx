import React, { Component } from "react";
import { Link } from "react-router-dom";

/**
 * Enhanced ErrorBoundary with:
 * - Better error display
 * - Retry functionality
 * - Navigation fallbacks
 * - Error logging
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Log error for debugging
    console.error("UI_RENDER_ERROR", {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });

    // Track in analytics if available
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "exception", {
        description: error?.message || "Unknown error",
        fatal: false,
      });
    }
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleGoHome = () => {
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      const canRetry = retryCount < 3;

      return (
        <div className="app-shell" style={{ minHeight: "100vh" }}>
          <div style={{ padding: "40px", maxWidth: "600px", margin: "0 auto" }}>
            <div className="section-card error" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
              <h1 style={{ margin: "0 0 12px 0", fontSize: "1.4rem" }}>
                Something went wrong
              </h1>
              <p style={{ color: "var(--ink-500)", marginBottom: "20px" }}>
                {error?.message || "An unexpected error occurred while loading this page."}
              </p>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                {canRetry && (
                  <button
                    onClick={this.handleRetry}
                    className="favorite-button active"
                    style={{ cursor: "pointer" }}
                  >
                    🔄 Try Again
                  </button>
                )}
                <button
                  onClick={this.handleGoHome}
                  className="favorite-button"
                  style={{ cursor: "pointer" }}
                >
                  🏠 Go to Home
                </button>
              </div>

              {retryCount >= 3 && (
                <p
                  style={{
                    marginTop: "20px",
                    padding: "12px",
                    background: "#fef3c7",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                >
                  You've tried a few times. Try refreshing the page or{" "}
                  <Link to="/" style={{ color: "var(--accent-700)" }}>
                    return to the home page
                  </Link>
                  .
                </p>
              )}

              {import.meta.env.DEV && this.state.errorInfo && (
                <details
                  style={{
                    marginTop: "24px",
                    textAlign: "left",
                    background: "#f8f8f8",
                    padding: "12px",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                  }}
                >
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    Developer Details
                  </summary>
                  <pre
                    style={{
                      marginTop: "8px",
                      overflow: "auto",
                      maxHeight: "200px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {error?.stack}
                    {"\n\nComponent Stack:\n"}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div style={{ marginTop: "24px", textAlign: "center" }}>
              <p style={{ color: "var(--ink-500)", fontSize: "0.85rem" }}>
                Quick links:
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "8px" }}>
                <Link to="/" className="tag">Summary</Link>
                <Link to="/matchups" className="tag">Matchups</Link>
                <Link to="/standings" className="tag">Standings</Link>
                <Link to="/records" className="tag">Records</Link>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
