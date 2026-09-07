import React, { useState } from "react";

export function EnhancementsSettingsPanel({
  enhancements,
  saveStatus = { message: "", saving: false, type: "" },
  onAddEnhancement,
  onDeleteEnhancement,
  onUpdateEnhancement,
}) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="admin-settings-section" id="admin-enhancements">
      <div className="admin-screen-heading compact-settings-heading">
        <div>
          <p>Add-ons</p>
          <h2>Enhancements</h2>
        </div>
        <button type="button" onClick={onAddEnhancement}>Add enhancement</button>
      </div>
      <div className="admin-enhancement-list">
        {enhancements.map((item) => (
          <article className={expandedId === item.id ? "admin-enhancement-card is-expanded" : "admin-enhancement-card"} key={item.id}>
            <button
              type="button"
              className="admin-enhancement-summary"
              aria-expanded={expandedId === item.id}
              aria-controls={`enhancement-details-${item.id}`}
              onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}
            >
              <span className="admin-enhancement-summary-name">{item.name}</span>
              <span className="admin-enhancement-summary-value">£{item.price}</span>
              <span className="admin-enhancement-summary-value">{item.durationMinutes ?? 0} min</span>
              <span className="admin-enhancement-summary-chevron" aria-hidden="true">{expandedId === item.id ? "⌃" : "⌄"}</span>
            </button>
            {expandedId === item.id && (
              <div className="admin-enhancement-details" id={`enhancement-details-${item.id}`}>
                <label>
                  <span>Name</span>
                  <input value={item.name} onChange={(event) => onUpdateEnhancement(item.id, { name: event.target.value })} />
                </label>
                <label>
                  <span>Price</span>
                  <input type="number" min="0" value={item.price} onChange={(event) => onUpdateEnhancement(item.id, { price: event.target.value })} />
                </label>
                <label>
                  <span>Extra time</span>
                  <input type="number" min="0" step="5" value={item.durationMinutes ?? 0} onChange={(event) => onUpdateEnhancement(item.id, { durationMinutes: event.target.value })} />
                </label>
                <label className="admin-enhancement-description">
                  <span>Description</span>
                  <input value={item.description} onChange={(event) => onUpdateEnhancement(item.id, { description: event.target.value })} />
                </label>
                <label className="admin-toggle-row admin-enhancement-active">
                  <input type="checkbox" checked={item.active !== false} onChange={(event) => onUpdateEnhancement(item.id, { active: event.target.checked })} />
                  <span>{item.active !== false ? "Active" : "Hidden"}</span>
                </label>
                <button type="button" className="admin-danger-option" onClick={() => onDeleteEnhancement(item.id)}>Delete</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {saveStatus.message && (
        <p className={`admin-settings-save-status ${saveStatus.type || ""}`} aria-live="polite">
          {saveStatus.message}
        </p>
      )}
    </div>
  );
}
