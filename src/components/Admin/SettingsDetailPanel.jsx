import React from "react";

export function SettingsDetailPanel({
  title,
  description,
  items = [],
  actions = null,
  note = "",
}) {
  return (
    <div className="settings-placeholder settings-detail-panel">
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {items.length > 0 && (
        <div className="settings-detail-grid">
          {items.map((item) => (
            <article className="settings-detail-item" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      )}
      {note && <p className="admin-muted-note">{note}</p>}
      {actions && <div className="settings-detail-actions">{actions}</div>}
    </div>
  );
}
