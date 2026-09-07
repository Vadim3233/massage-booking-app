export function RuntimeDiagnosticOverlay({ diagnostic, onClear }) {
  if (!diagnostic || !import.meta.env.DEV) return null;

  return (
    <section className="runtime-diagnostic-overlay" role="alert">
      <div className="admin-screen admin-diagnostic-error">
        <div className="admin-screen-heading">
          <div>
            <p>Runtime crash report</p>
            <h2>App error captured</h2>
          </div>
        </div>
        <div className="admin-action-message">
          <strong>Error message</strong>
          <pre>{diagnostic.message || "No error message available."}</pre>
        </div>
        <div className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>File / line</p>
              <h3>Source location</h3>
            </div>
          </div>
          <pre>{diagnostic.location || "No file or line information available."}</pre>
        </div>
        <div className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>JavaScript stack</p>
              <h3>Stack</h3>
            </div>
          </div>
          <pre>{diagnostic.stack || "No JavaScript stack available."}</pre>
        </div>
        <button type="button" className="admin-secondary-action" onClick={onClear}>
          Clear diagnostic
        </button>
      </div>
    </section>
  );
}
