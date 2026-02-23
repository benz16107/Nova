import React, { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Dashboard error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            padding: "2rem",
            maxWidth: 600,
            margin: "2rem auto",
            background: "#fef2f2",
            border: "2px solid #dc2626",
            borderRadius: 8,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ margin: "0 0 0.5rem 0", color: "#b91c1c" }}>Something went wrong</h1>
          <pre style={{ margin: 0, fontSize: "0.875rem", overflow: "auto", whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#666" }}>
            Check the browser console (F12) for details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
