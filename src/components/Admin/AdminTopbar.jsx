import React from "react";

export function AdminTopbar({
  activeTab,
  calendarMode,
  tabs,
  onOpenMenu,
  onSwitchClient,
}) {
  return (
    <header className="admin-topbar">
      <button type="button" className="admin-menu-button" onClick={() => onOpenMenu()} aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>
      <div>
        <p>VAD MASSAGE</p>
        <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
        {activeTab === "calendar" && (
          <span className="admin-view-subtitle">
            {{
              agenda: "Agenda view",
              day: "Day view",
              "three-day": "3-day view",
              week: "Week view",
              month: "Month view",
              year: "Year view",
            }[calendarMode] || "Agenda view"}
          </span>
        )}
      </div>
      <div className="top-action-cluster">
        <button type="button" className="admin-client-link square-green-action" onClick={() => onSwitchClient()}>Client</button>
      </div>
    </header>
  );
}
