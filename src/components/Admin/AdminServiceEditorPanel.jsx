import React from "react";
import { Link2 } from "lucide-react";

export function AdminServiceEditorPanel({
  durationOptions,
  imagePreviewComponent: ImagePreview,
  service,
  serviceEditorDirty,
  serviceEditorDraft,
  serviceEditorError,
  serviceEditorSaving,
  onApplyPricingToAll,
  onCancel,
  onChangeDraft,
  onChangePrice,
  onCopyBookingLink,
  onDelete,
  onSave,
  onToggleVisibility,
}) {
  return (
    <div className="admin-service-editor">
      <section className="admin-service-editor-section">
        <h4>Basic details</h4>
        <div className="admin-service-editor-toggle-row">
          <span>Client visibility</span>
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
        </div>
        <label>
          <span>Title</span>
          <input
            autoFocus
            type="text"
            value={serviceEditorDraft.name}
            onChange={(event) => onChangeDraft("name", event.target.value)}
          />
        </label>
        <label>
          <span>Short description</span>
          <input
            type="text"
            value={serviceEditorDraft.shortDescription}
            onChange={(event) => onChangeDraft("shortDescription", event.target.value)}
          />
        </label>
        <label>
          <span>Longer description</span>
          <textarea
            value={serviceEditorDraft.longDescription}
            onChange={(event) => onChangeDraft("longDescription", event.target.value)}
          />
        </label>
        <div className="admin-service-image-row">
          <ImagePreview src={serviceEditorDraft.imageUrl} title={serviceEditorDraft.name} />
          <label>
            <span>Picture URL or image path</span>
            <input
              type="text"
              value={serviceEditorDraft.imageUrl}
              onChange={(event) => onChangeDraft("imageUrl", event.target.value)}
            />
          </label>
        </div>
      </section>
      <section className="admin-service-editor-section">
        <h4>Pricing</h4>
        <div className="admin-service-pricing-table" aria-label={`${service.name} pricing`}>
          <div className="admin-service-pricing-head" aria-hidden="true">
            <span>Duration</span>
            <span>Price</span>
          </div>
          {[...durationOptions].sort((first, second) => first.minutes - second.minutes).map((option) => (
            <label className="admin-service-pricing-row" key={option.minutes}>
              <span>{option.minutes} min</span>
              <span>
                <b aria-hidden="true">{"\u00a3"}</b>
                <input
                  aria-label={`${service.name} ${option.minutes} minute price`}
                  inputMode="numeric"
                  min="0"
                  step="1"
                  type="number"
                  value={serviceEditorDraft.durationPrices?.[option.minutes] ?? ""}
                  onChange={(event) => onChangePrice(option.minutes, event.target.value)}
                />
              </span>
            </label>
          ))}
        </div>
        <button type="button" className="admin-muted-action" disabled title="Client durations are currently fixed at 60, 90 and 120 minutes.">
          + Add duration
        </button>
        <button type="button" className="admin-secondary-action admin-pricing-apply-button" onClick={() => onApplyPricingToAll(service)}>
          Apply pricing to all services
        </button>
      </section>
      <section className="admin-service-editor-section">
        <h4>More actions</h4>
        <div className="admin-service-more-actions">
          <button type="button" className="admin-secondary-action" onClick={() => onCopyBookingLink(service)}>
            <Link2 aria-hidden="true" size={16} />
            Copy booking link
          </button>
          <button
            type="button"
            className="admin-danger-option"
            onClick={() => onDelete(service)}
          >
            Delete service
          </button>
        </div>
      </section>
      {serviceEditorError && <p className="admin-service-editor-error" role="alert">{serviceEditorError}</p>}
      <div className="admin-service-editor-actions">
        <span>{serviceEditorDirty ? "Unsaved changes" : "No unsaved changes"}</span>
        <button type="button" className="admin-secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="admin-primary-action" disabled={serviceEditorSaving} onClick={() => onSave(service)}>
          {serviceEditorSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
