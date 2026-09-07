import React from "react";
import { Plus } from "lucide-react";

export function AdminServicesPanel({
  editingServiceId,
  renderServiceEditor,
  serviceSearch,
  services,
  settingsReturnCategory,
  onAddService,
  onBackToSettings,
  onChangeSearch,
  onToggleEditor,
  onToggleVisibility,
}) {
  return (
    <section className="admin-screen">
      <div className="admin-screen-heading">
        <div>
          <p>Services</p>
          <h2>Service offerings</h2>
          <span className="admin-screen-helper">Manage the services clients can book.</span>
        </div>
        <div className="admin-service-heading-actions">
          <button type="button" className="admin-primary-action" onClick={onAddService}>
            <Plus size={16} aria-hidden="true" />
            Add service
          </button>
          {settingsReturnCategory && (
            <button
              type="button"
              className="settings-folder-back"
              onClick={onBackToSettings}
            >
              <span aria-hidden="true">&lt;</span>
              Back to Settings
            </button>
          )}
        </div>
      </div>
      <input
        className="admin-search"
        type="search"
        placeholder="Search services"
        value={serviceSearch}
        onChange={(event) => onChangeSearch(event.target.value)}
      />
      <div className="admin-service-grid">
        {services.map((service) => (
          <article className="admin-service-card" key={service.id}>
            <div className="admin-service-card-main">
              <div className="admin-service-title-block">
                <h3>{service.name}</h3>
              </div>
              <div className="admin-service-actions">
                <label className="admin-service-visibility-switch">
                  <input
                    type="checkbox"
                    checked={service.visible}
                    aria-label={`${service.name} is ${service.visible ? "visible" : "hidden"} to clients`}
                    onChange={() => onToggleVisibility(service.id)}
                  />
                  <span aria-hidden="true" />
                  <strong>{service.visible ? "Visible" : "Hidden"}</strong>
                </label>
                <button type="button" className="admin-secondary-action" onClick={() => onToggleEditor(service)}>
                  {editingServiceId === service.id ? "Collapse" : "Edit"}
                </button>
              </div>
            </div>
            {editingServiceId === service.id && renderServiceEditor(service)}
          </article>
        ))}
      </div>
    </section>
  );
}
