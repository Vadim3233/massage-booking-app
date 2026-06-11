import React, { useState } from "react";
import { ADMIN_TABS } from "../Admin/AdminWorkspace.jsx";

// Constants for services section
const SERVICE_COLORS = [
  "#6f8f72", "#c36b42", "#4b738a", "#e4b95f", "#8b3e27", "#344f3c"
];
const DEFAULT_TRAVEL_BUFFER = 60;

// Settings categories configuration - 9 categories as specified
const SETTINGS_CATEGORIES = [
  {
    id: "business-details",
    title: "Business Details",
    icon: "🏢",
    description: "Manage your business information and preferences",
    settings: ["admin-working-rules"],
  },
  {
    id: "services-prices",
    title: "Services & Prices",
    icon: "✨",
    description: "Configure services, pricing, and enhancements",
    settings: ["admin-services"],
  },
  {
    id: "working-hours",
    title: "Working Hours",
    icon: "⏰",
    description: "Set your availability and working rules",
    settings: ["admin-working-rules"],
  },
  {
    id: "travel-areas",
    title: "Travel & Service Areas",
    icon: "📍",
    description: "Manage service coverage zones and travel settings",
    settings: ["admin-service-areas"],
  },
  {
    id: "payments",
    title: "Payments",
    icon: "💳",
    description: "Payment methods and transaction settings",
    settings: [],
  },
  {
    id: "receipts",
    title: "Receipts",
    icon: "📄",
    description: "Invoice and receipt configuration",
    settings: [],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: "🔔",
    description: "Telegram and email notifications",
    settings: ["admin-telegram-settings"],
  },
  {
    id: "clients",
    title: "Clients",
    icon: "👥",
    description: "Customer directory and client settings",
    settings: [],
  },
  {
    id: "security",
    title: "Security",
    icon: "🔒",
    description: "Password and account security settings",
    settings: [],
  },
];

// Settings sections mapping to their content
const SETTINGS_SECTIONS = {
  "admin-working-rules": {
    title: "Working Rules",
    subtitle: "Configure your working hours and schedule settings",
  },
  "admin-service-areas": {
    title: "Service Areas",
    subtitle: "Manage client booking areas and coverage zones",
  },
  "admin-telegram-settings": {
    title: "Telegram Notifications",
    subtitle: "Configure Telegram bot for client updates",
  },
  "admin-services": {
    title: "Services",
    subtitle: "Manage service offerings and pricing",
  },
};

function SettingsDashboard({ 
  activeTab, 
  setActiveTab, 
  selectedCategory,
  onCategorySelect,
  onBackToSettings,
  children,
  ...props 
}) {
  // Use props for category selection instead of local state
  const handleCategorySelect = (category) => {
    if (onCategorySelect) {
      onCategorySelect(category);
    }
  };

  // Handle back to settings list
  const handleBackToSettings = () => {
    if (onBackToSettings) {
      onBackToSettings();
    }
  };

  // Render settings categories grid
  if (!selectedCategory) {
    return (
      <section className="admin-screen">
        <div className="admin-screen-heading">
          <div>
            <p>Settings</p>
            <h2>Settings Dashboard</h2>
          </div>
        </div>
        
        <div className="admin-settings-dashboard">
          <p className="admin-muted-note">
            Select a category to manage your settings
          </p>
          
          <div className="admin-settings-grid">
            {SETTINGS_CATEGORIES.map((category) => (
              <button
                type="button"
                key={category.id}
                className="admin-settings-card"
                onClick={() => handleCategorySelect(category)}
              >
                <span className="admin-settings-icon">{category.icon}</span>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <span className="admin-settings-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Render settings section with back button
  return (
    <section className="admin-screen">
      <div className="admin-screen-heading">
        <div>
          <button
            type="button"
            className="admin-secondary-action admin-back-button"
            onClick={handleBackToSettings}
          >
            ← Back to Settings
          </button>
          <p>Settings</p>
          <h2>{selectedCategory.title}</h2>
        </div>
      </div>

      <div className="admin-settings-content">
        {children}
      </div>
    </section>
  );
}

// Individual settings section components
function WorkingRulesSection({ settings, workingRulesDraft, updateWorkingRuleDraft, saveWorkingRules, workingRulesDirty, onResetCurrentDay }) {
  return (
    <div className="admin-settings-section" id="admin-working-rules">
      <div className="admin-screen-heading compact-settings-heading">
        <div>
          <p>Working Hours</p>
          <h2>Working rules</h2>
        </div>
        <button type="button" onClick={onResetCurrentDay}>Reset current day</button>
      </div>
      <div className="working-rules-grid">
        <label>Working start
          <input 
            type="time" 
            value={workingRulesDraft.workingStart} 
            onChange={(event) => updateWorkingRuleDraft("workingStart", event.target.value)} 
          />
        </label>
        <label>Working end
          <input 
            type="time" 
            value={workingRulesDraft.workingEnd} 
            onChange={(event) => updateWorkingRuleDraft("workingEnd", event.target.value)} 
          />
        </label>
        <label>Day Mode
          <select 
            value={workingRulesDraft.mode} 
            onChange={(event) => updateWorkingRuleDraft("mode", event.target.value)}
          >
            <option value="flexible">Flexible Mode</option>
            <option value="optimized">Optimized Mode</option>
          </select>
        </label>
        <label>Start of Day
          <select 
            value={workingRulesDraft.startMode} 
            onChange={(event) => updateWorkingRuleDraft("startMode", event.target.value)}
          >
            <option value="flexible">Flexible Start</option>
            <option value="fixed">Fixed Start</option>
          </select>
        </label>
        <label>Fixed Start
          <input 
            type="time" 
            value={workingRulesDraft.fixedStart} 
            onChange={(event) => updateWorkingRuleDraft("fixedStart", event.target.value)} 
          />
        </label>
        <label>Release time
          <input 
            type="time" 
            value={workingRulesDraft.releaseTime} 
            disabled={!workingRulesDraft.anchorReleaseEnabled} 
            onChange={(event) => updateWorkingRuleDraft("releaseTime", event.target.value)} 
          />
        </label>
        <label className="admin-toggle-row">
          <input 
            type="checkbox" 
            checked={Boolean(workingRulesDraft.anchorReleaseEnabled)} 
            onChange={(event) => updateWorkingRuleDraft("anchorReleaseEnabled", event.target.checked)} 
          />
          <span>Anchor release enabled</span>
        </label>
      </div>
      <div className="working-rules-actions">
        <button 
          type="button" 
          className="admin-primary-action" 
          disabled={!workingRulesDirty} 
          onClick={saveWorkingRules}
        >
          Save
        </button>
        <button type="button" className="admin-secondary-action" onClick={onResetCurrentDay}>
          Reset current day
        </button>
        <span>{workingRulesDirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>
    </div>
  );
}

function ServiceAreasSection({ serviceAreas, onAddServiceArea, onDeleteServiceArea, onUpdateServiceArea }) {
  return (
    <div className="admin-settings-section service-area-settings-section" id="admin-service-areas">
      <div className="admin-screen-heading compact-settings-heading">
        <div>
          <p>Client Booking</p>
          <h2>Service areas</h2>
        </div>
        <button type="button" onClick={onAddServiceArea}>Add area</button>
      </div>
      <p className="admin-muted-note">
        Turn areas on or off for the client booking form. Active areas appear on the first booking step.
      </p>
      <div className="admin-service-area-grid">
        {serviceAreas.map((area) => (
          <article 
            className={area.active !== false ? "admin-service-area-card active-admin-service-area" : "admin-service-area-card"} 
            key={area.id}
          >
            <label className="admin-service-area-toggle">
              <input
                type="checkbox"
                checked={area.active !== false}
                onChange={(event) => onUpdateServiceArea(area.id, { active: event.target.checked })}
              />
              <span>{area.active !== false ? "Visible to clients" : "Hidden"}</span>
            </label>
            <label className="admin-service-area-name">
              <span>Name</span>
              <input 
                value={area.name} 
                onChange={(event) => onUpdateServiceArea(area.id, { name: event.target.value })} 
              />
            </label>
            {area.custom && (
              <button 
                type="button" 
                className="admin-danger-option service-area-delete-button" 
                onClick={() => onDeleteServiceArea(area.id)}
              >
                Delete
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function TelegramSettingsSection({ telegramTestStatus, sendTelegramTestFromSettings }) {
  return (
    <div className="admin-settings-section telegram-settings-section" id="admin-telegram-settings">
      <div className="admin-screen-heading compact-settings-heading">
        <div>
          <p>Client Updates</p>
          <h2>Telegram notifications</h2>
        </div>
        <button
          type="button"
          className="admin-primary-action"
          disabled={telegramTestStatus.sending}
          onClick={sendTelegramTestFromSettings}
        >
          {telegramTestStatus.sending ? "Sending..." : "Send test"}
        </button>
      </div>
      <p className="admin-muted-note">
        Send a private test message to the Telegram chat saved in Vercel. The client must start the bot before it can message them.
      </p>
      {telegramTestStatus.message && (
        <p className={`telegram-test-status ${telegramTestStatus.type || "info"}`} role="status">
          {telegramTestStatus.message}
        </p>
      )}
    </div>
  );
}

function ServicesSection({ services, serviceDetails, onServiceNameChange, onServiceDetailChange, onServiceVisibilityChange, onAddEnhancement, onDeleteEnhancement, onUpdateEnhancement, enhancements }) {
  const [serviceSearch, setServiceSearch] = useState("");
  const [editingServiceId, setEditingServiceId] = useState(null);

  const serviceCards = services.map((service, index) => ({
    ...service,
    color: SERVICE_COLORS[index % SERVICE_COLORS.length],
    ...(serviceDetails[service.id] ?? {
      buffer: service.id === "head-massage" ? 30 : DEFAULT_TRAVEL_BUFFER,
      duration: service.id === "head-massage" ? 60 : 90,
      price: service.id === "head-massage" ? 78 : 120 + index * 12,
    }),
  }));

  const filteredServices = serviceCards.filter((service) =>
    service.name.toLowerCase().includes(serviceSearch.trim().toLowerCase())
  );

  return (
    <div className="admin-settings-section services-section" id="admin-services">
      <div className="admin-screen-heading compact-settings-heading">
        <div>
          <p>Services</p>
          <h2>Service offerings</h2>
        </div>
      </div>
      <input
        className="admin-search"
        type="search"
        placeholder="Search services"
        value={serviceSearch}
        onChange={(event) => setServiceSearch(event.target.value)}
      />
      <div className="admin-service-grid">
        {filteredServices.map((service) => (
          <article className="admin-service-card" key={service.id}>
            <span style={{ background: service.color }}>{service.visible ? "Active" : "Hidden"}</span>
            <h3>{service.name}</h3>
            <strong>£{service.price}</strong>
            <div className="admin-service-actions">
              <button type="button" onClick={() => setEditingServiceId((current) => current === service.id ? null : service.id)}>
                {editingServiceId === service.id ? "Done" : "Edit"}
              </button>
              <label className="admin-toggle-row">
                <input type="checkbox" checked={service.visible} onChange={() => onServiceVisibilityChange(service.id)} />
                <span>Visible</span>
              </label>
            </div>
            {editingServiceId === service.id && (
              <div className="admin-service-editor">
                <label>
                  Title
                  <input
                    type="text"
                    value={service.name}
                    onChange={(event) => onServiceNameChange(service.id, event.target.value)}
                  />
                </label>
                <label>
                  Short description
                  <input
                    type="text"
                    value={service.shortDescription}
                    onChange={(event) => onServiceDetailChange(service.id, "shortDescription", event.target.value)}
                  />
                </label>
                <label>
                  Longer description
                  <textarea
                    value={service.longDescription}
                    onChange={(event) => onServiceDetailChange(service.id, "longDescription", event.target.value)}
                  />
                </label>
                <label>
                  Picture URL
                  <input
                    type="text"
                    value={service.imageUrl}
                    onChange={(event) => onServiceDetailChange(service.id, "imageUrl", event.target.value)}
                  />
                </label>
                <label>
                  Duration
                  <input
                    min="0"
                    step="15"
                    type="number"
                    value={service.duration}
                    onChange={(event) => onServiceDetailChange(service.id, "duration", event.target.value)}
                  />
                </label>
                <label>
                  Buffer
                  <input
                    min="0"
                    step="15"
                    type="number"
                    value={service.buffer}
                    onChange={(event) => onServiceDetailChange(service.id, "buffer", event.target.value)}
                  />
                </label>
                <label>
                  Price
                  <input
                    min="0"
                    step="1"
                    type="number"
                    value={service.price}
                    onChange={(event) => onServiceDetailChange(service.id, "price", event.target.value)}
                  />
                </label>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

// Export the dashboard component
export { SettingsDashboard, SETTINGS_CATEGORIES, SETTINGS_SECTIONS };
export { WorkingRulesSection, ServiceAreasSection, TelegramSettingsSection, ServicesSection };