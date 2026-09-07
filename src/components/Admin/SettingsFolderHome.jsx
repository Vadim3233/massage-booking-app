import React from "react";

export function SettingsFolderHome({
  categories,
  onOpenCategory,
  onOpenSessionPreferences,
  onOpenCurrentSettings,
}) {
  return (
    <>
      <div className="admin-screen-heading settings-home-heading">
        <div>
          <p>Settings</p>
          <h2>Settings</h2>
        </div>
      </div>
      <div className="settings-folder-list">
        {categories.map((category) => (
          <React.Fragment key={category.id}>
            <button
              type="button"
              className="settings-folder-row"
              onClick={() => onOpenCategory(category.id)}
            >
              <span>{category.label}</span>
              <span aria-hidden="true">&gt;</span>
            </button>
            {category.id === "services" && (
              <button
                type="button"
                className="settings-folder-row settings-direct-row"
                onClick={() => onOpenSessionPreferences()}
              >
                <span>Session Preferences</span>
                <span aria-hidden="true">&gt;</span>
              </button>
            )}
          </React.Fragment>
        ))}
        <button
          type="button"
          className="settings-folder-row settings-current-row"
          onClick={() => onOpenCurrentSettings()}
        >
          <span>Current settings</span>
          <span aria-hidden="true">&gt;</span>
        </button>
      </div>
    </>
  );
}
