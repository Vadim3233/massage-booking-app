import React from "react";

export class AdminPanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    console.error(error, errorInfo);
    this.setState({ error, errorInfo });
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, errorInfo: null });
    }
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.message || String(this.state.error);
      const stack = this.state.error?.stack || "";
      const componentStack = this.state.errorInfo?.componentStack || "";
      const showDiagnosticDetails = import.meta.env.DEV;
      return (
        <section className="admin-screen admin-diagnostic-error">
          <div className="admin-screen-heading">
            <div>
              <p>{showDiagnosticDetails ? "Analytics crash report" : "Analytics"}</p>
              <h2>Analytics could not render</h2>
            </div>
          </div>
          <div className="admin-action-message" role="alert">
            <strong>{showDiagnosticDetails ? "Error message" : "Something went wrong"}</strong>
            <pre>{showDiagnosticDetails ? message : "Please refresh the page or try another admin section."}</pre>
          </div>
          {showDiagnosticDetails && (
            <>
              <div className="analytics-panel">
                <div className="analytics-panel-heading">
                  <div>
                    <p>File / stack</p>
                    <h3>JavaScript stack</h3>
                  </div>
                </div>
                <pre>{stack || "No JavaScript stack available."}</pre>
              </div>
              <div className="analytics-panel">
                <div className="analytics-panel-heading">
                  <div>
                    <p>React component stack</p>
                    <h3>Component stack</h3>
                  </div>
                </div>
                <pre>{componentStack || "No React component stack available."}</pre>
              </div>
            </>
          )}
          <button type="button" className="admin-secondary-action" onClick={() => this.setState({ error: null, errorInfo: null })}>
            Retry
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
