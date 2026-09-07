import React from "react";
import { SettingsFolderHome } from "./SettingsFolderHome.jsx";

export function SettingsFolderNavigator({
  activeCategory,
  categories,
  renderCurrentSettingsContent,
  renderSubsectionContent,
  selectedCategoryId,
  selectedSubsection,
  settingsReturnCategory,
  onBackFromCategory,
  onBackFromCurrentSettings,
  onBackFromSubsection,
  onOpenCategory,
  onOpenCurrentSettings,
  onOpenSessionPreferences,
  onOpenSubsection,
}) {
  void settingsReturnCategory;
  return (
    <section className="admin-screen settings-folder-shell">
      {selectedSubsection ? (
        <>
          <div className="settings-folder-header">
            <button type="button" className="settings-folder-back" onClick={() => onBackFromSubsection()}>
              <span aria-hidden="true">&lt;</span>
              Back
            </button>
            <div>
              <p>{activeCategory?.label ?? "Settings"}</p>
              <h2>{selectedSubsection}</h2>
            </div>
          </div>
          {renderSubsectionContent()}
        </>
      ) : selectedCategoryId === "current" ? (
        <div className="settings-current-content">
          <div className="settings-folder-header">
            <button
              type="button"
              className="settings-folder-back"
              onClick={() => onBackFromCurrentSettings()}
            >
              <span aria-hidden="true">&lt;</span>
              Back
            </button>
            <div>
              <p>Settings</p>
              <h2>Current settings</h2>
            </div>
          </div>
          {renderCurrentSettingsContent()}
        </div>
      ) : activeCategory ? (
        <>
          <div className="settings-folder-header">
            <button type="button" className="settings-folder-back" onClick={() => onBackFromCategory()}>
              <span aria-hidden="true">&lt;</span>
              Back
            </button>
            <div>
              <p>Settings</p>
              <h2>{activeCategory.label}</h2>
            </div>
          </div>
          <div className="settings-folder-list">
            {activeCategory.sections.map((section) => (
              <button
                type="button"
                className="settings-folder-row"
                key={section}
                onClick={() => onOpenSubsection(section)}
              >
                <span>{section}</span>
                <span aria-hidden="true">&gt;</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <SettingsFolderHome
          categories={categories}
          onOpenCategory={onOpenCategory}
          onOpenSessionPreferences={onOpenSessionPreferences}
          onOpenCurrentSettings={onOpenCurrentSettings}
        />
      )}
    </section>
  );
}
