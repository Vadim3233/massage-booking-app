import React, { useState } from "react";
import { BusinessAnalyticsDashboard } from "./BusinessAnalyticsDashboard.jsx";
import { buildAdminCustomers } from "./adminCustomers.js";
import { SettingsDashboard, WorkingRulesSection, ServiceAreasSection, TelegramSettingsSection, ServicesSection } from "./AdminSettingsDashboard.jsx";

// Admin tabs configuration
export const ADMIN_TABS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "customers", label: "Customers", icon: "👥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function AdminWorkspace({
  bookings,
  coverageZones,
  days,
  enhancements,
  serviceAreas,
  onCloseWaitlistRequest,
  onCreateAppointment,
  onCreatePersonalEvent,
  onDeleteBooking,
  onDuplicateBooking,
  onAddEnhancement,
  onDeleteEnhancement,
  onUpdateEnhancement,
  onUpdateCoverageZone,
  onAddServiceArea,
  onDeleteServiceArea,
  onUpdateServiceArea,
  onResetCurrentDay,
  onResetStoredData,
  onSendWaitlistOffer,
  onServiceDetailChange,
  onServiceNameChange,
  onServiceVisibilityChange,
  onSetActiveView,
  onSetSelectedDayIndex,
  onUpdateBooking,
  onUpdateSetting,
  preview,
  requestedDuration,
  requestedTravelBuffer,
  selectedDay,
  selectedDayIndex,
  services,
  serviceDetails,
  settings,
  waitlistEntries,
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [telegramTestStatus, setTelegramTestStatus] = useState({ sending: false, message: "", type: "" });
  const [workingRulesDraft, setWorkingRulesDraft] = useState(settings);
  const [workingRulesDirty, setWorkingRulesDirty] = useState(false);

  // Handle telegram test
  async function sendTelegramTestFromSettings() {
    setTelegramTestStatus({ sending: true, message: "", type: "" });
    
    try {
      // Import the telegram test function from App.jsx
      const { postTelegramTest, telegramTestErrorMessage } = await import("../../App.jsx");
      const result = await postTelegramTest();
      
      if (result.sent) {
        setTelegramTestStatus({
          sending: false,
          message: "Test message sent successfully!",
          type: "success"
        });
      } else {
        setTelegramTestStatus({
          sending: false,
          message: result.reason || "Test message could not be sent.",
          type: "error"
        });
      }
    } catch (error) {
      const { telegramTestErrorMessage } = await import("../../App.jsx");
      setTelegramTestStatus({
        sending: false,
        message: telegramTestErrorMessage(error),
        type: "error"
      });
    }
  }

  // Handle working rules updates
  function updateWorkingRuleDraft(field, value) {
    setWorkingRulesDraft(current => ({ ...current, [field]: value }));
    setWorkingRulesDirty(true);
  }

  function saveWorkingRules() {
    Object.keys(workingRulesDraft).forEach(key => {
      if (workingRulesDraft[key] !== settings[key]) {
        onUpdateSetting(key, workingRulesDraft[key]);
      }
    });
    setWorkingRulesDirty(false);
  }

  function resetCurrentDay() {
    onResetCurrentDay();
    setWorkingRulesDraft(settings);
    setWorkingRulesDirty(false);
  }

  // Handle category selection in settings
  function handleCategorySelect(category) {
    setSelectedCategory(category);
  }

  function handleBackToSettings() {
    setSelectedCategory(null);
  }

  // Render settings content based on selected category
  function renderSettingsContent() {
    if (!selectedCategory) return null;

    switch (selectedCategory.id) {
      case "business-details":
      case "working-hours":
        return (
          <WorkingRulesSection
            settings={settings}
            workingRulesDraft={workingRulesDraft}
            updateWorkingRuleDraft={updateWorkingRuleDraft}
            saveWorkingRules={saveWorkingRules}
            workingRulesDirty={workingRulesDirty}
            onResetCurrentDay={resetCurrentDay}
          />
        );
      
      case "travel-areas":
        return (
          <ServiceAreasSection
            serviceAreas={serviceAreas}
            onAddServiceArea={onAddServiceArea}
            onDeleteServiceArea={onDeleteServiceArea}
            onUpdateServiceArea={onUpdateServiceArea}
          />
        );
      
      case "notifications":
        return (
          <TelegramSettingsSection
            telegramTestStatus={telegramTestStatus}
            sendTelegramTestFromSettings={sendTelegramTestFromSettings}
          />
        );
      
      case "services-prices":
        return (
          <ServicesSection
            services={services}
            serviceDetails={serviceDetails}
            onServiceNameChange={onServiceNameChange}
            onServiceDetailChange={onServiceDetailChange}
            onServiceVisibilityChange={onServiceVisibilityChange}
            onAddEnhancement={onAddEnhancement}
            onDeleteEnhancement={onDeleteEnhancement}
            onUpdateEnhancement={onUpdateEnhancement}
            enhancements={enhancements}
          />
        );
      
      case "payments":
      case "receipts":
      case "clients":
      case "security":
        return (
          <div className="admin-settings-section">
            <div className="admin-screen-heading compact-settings-heading">
              <div>
                <p>{selectedCategory.title}</p>
                <h2>Coming Soon</h2>
              </div>
            </div>
            <p className="admin-muted-note">
              This settings category is not yet implemented. The existing functionality has been preserved.
            </p>
          </div>
        );
      
      default:
        return (
          <div className="admin-settings-section">
            <div className="admin-screen-heading compact-settings-heading">
              <div>
                <p>{selectedCategory.title}</p>
                <h2>Coming Soon</h2>
              </div>
            </div>
            <p className="admin-muted-note">
              This settings category is not yet implemented. The existing functionality has been preserved.
            </p>
          </div>
        );
    }
  }

  return (
    <div className="admin-workspace">
      {/* Admin Navigation */}
      <nav className="admin-nav">
        <div className="admin-nav-tabs">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "admin-nav-tab active-admin-tab" : "admin-nav-tab"}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedCategory(null); // Reset category when switching tabs
              }}
            >
              <span className="admin-tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="admin-secondary-action"
          onClick={() => onSetActiveView("client")}
        >
          Switch to Client View
        </button>
      </nav>

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        <BusinessAnalyticsDashboard
          bookings={bookings}
          days={days}
          services={services}
          waitlistEntries={waitlistEntries}
          onCreateAppointment={onCreateAppointment}
          onCreatePersonalEvent={onCreatePersonalEvent}
          onDeleteBooking={onDeleteBooking}
          onDuplicateBooking={onDuplicateBooking}
          onSetSelectedDayIndex={onSetSelectedDayIndex}
          onUpdateBooking={onUpdateBooking}
          preview={preview}
          requestedDuration={requestedDuration}
          requestedTravelBuffer={requestedTravelBuffer}
          selectedDay={selectedDay}
          selectedDayIndex={selectedDayIndex}
        />
      )}

      {activeTab === "customers" && (
        <section className="admin-screen">
          <div className="admin-screen-heading">
            <div>
              <p>Customer Management</p>
              <h2>Client Directory</h2>
            </div>
          </div>
          {buildAdminCustomers({ bookings, days, waitlistEntries, onSendWaitlistOffer, onCloseWaitlistRequest })}
        </section>
      )}

      {activeTab === "settings" && (
        <SettingsDashboard
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedCategory={selectedCategory}
          onCategorySelect={handleCategorySelect}
          onBackToSettings={handleBackToSettings}
        >
          {renderSettingsContent()}
        </SettingsDashboard>
      )}
    </div>
  );
}

export default AdminWorkspace;