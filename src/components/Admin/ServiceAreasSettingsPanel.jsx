import React from "react";

export function ServiceAreasSettingsPanel({
  serviceAreas,
  onAddServiceArea,
  onDeleteServiceArea,
  onUpdateServiceArea,
}) {
  return (
    <div className="admin-settings-section service-area-settings-section" id="admin-service-areas">
      <div className="admin-screen-heading compact-settings-heading">
        <div>
          <p>Client booking</p>
          <h2>Service areas</h2>
        </div>
        <button type="button" onClick={onAddServiceArea}>Add area</button>
      </div>
      <p className="admin-muted-note">
        Turn areas on or off and set optional manual fees. Active areas appear on the first booking step.
      </p>
      <div className="admin-service-area-list">
        {serviceAreas.map((area) => (
          <article className={area.active !== false ? "admin-service-area-card active-admin-service-area" : "admin-service-area-card"} key={area.id}>
            <span className="admin-service-area-position" aria-label={`${area.name || "Service area"} position`}>
              {area.active !== false ? "Visible" : "Hidden"}
            </span>
            <label className="admin-service-area-toggle">
              <input
                type="checkbox"
                checked={area.active !== false}
                onChange={(event) => onUpdateServiceArea(area.id, { active: event.target.checked })}
              />
              <span>{area.active !== false ? "On" : "Off"}</span>
            </label>
            <label className="admin-service-area-name">
              <span>Name</span>
              <input value={area.name} onChange={(event) => onUpdateServiceArea(area.id, { name: event.target.value })} />
            </label>
            <div className="admin-service-area-fees">
              <label>
                <span>Congestion fee (£)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={area.congestionFee ?? 0}
                  onChange={(event) => onUpdateServiceArea(area.id, { congestionFee: Math.max(0, Number(event.target.value) || 0) })}
                />
              </label>
              <label>
                <span>Travel surcharge (£)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={area.travelSurcharge ?? 0}
                  onChange={(event) => onUpdateServiceArea(area.id, { travelSurcharge: Math.max(0, Number(event.target.value) || 0) })}
                />
              </label>
            </div>
            {area.custom && (
              <button type="button" className="admin-danger-option service-area-delete-button" onClick={() => onDeleteServiceArea(area.id)}>
                Delete
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
