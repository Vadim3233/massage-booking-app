import React from "react";

export function FinancialSettingsPanel({
  expenseCategories,
  expenses,
  financialSettingsDirty,
  financialSettingsDraft,
  onSaveFinancialSettings,
  onUpdateFinancialSettingsDraft,
}) {
  const currencyFields = [
    ["annualRevenueGoal", "Annual Revenue Target"],
    ["monthlyRevenueGoal", "Monthly revenue target (optional)"],
    ["taxPotSavedAmount", "Tax pot saved amount"],
  ];

  const dateFields = [
    ["taxYearStartMonth", "Tax year start month", "taxYearStartDay", "Tax year start day"],
    ["taxYearEndMonth", "Tax year end month", "taxYearEndDay", "Tax year end day"],
    ["taxReturnDeadlineMonth", "Tax return deadline month", "taxReturnDeadlineDay", "Tax return deadline day"],
  ];

  return (
    <div className="settings-placeholder financial-settings-panel">
      <div>
        <h3>Financial Settings</h3>
        <p>Set your revenue target and tax planning defaults. Profit is calculated automatically from revenue and expenses.</p>
      </div>

      <div className="admin-service-area-fees">
        {dateFields.map(([monthKey, monthLabel, dayKey, dayLabel]) => (
          <React.Fragment key={monthKey}>
            <label>
              <span>{monthLabel}</span>
              <input
                type="number"
                min="1"
                max="12"
                value={financialSettingsDraft[monthKey]}
                onChange={(event) => onUpdateFinancialSettingsDraft(monthKey, event.target.value)}
              />
            </label>
            <label>
              <span>{dayLabel}</span>
              <input
                type="number"
                min="1"
                max="31"
                value={financialSettingsDraft[dayKey]}
                onChange={(event) => onUpdateFinancialSettingsDraft(dayKey, event.target.value)}
              />
            </label>
          </React.Fragment>
        ))}
      </div>

      <div className="admin-service-area-fees">
        {currencyFields.map(([key, label]) => (
          <label key={key}>
            <span>{label} (GBP)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={financialSettingsDraft[key]}
              onChange={(event) => onUpdateFinancialSettingsDraft(key, event.target.value)}
            />
          </label>
        ))}
        <label>
          <span>Preferred max sessions per week</span>
          <input
            type="number"
            min="0"
            step="1"
            value={financialSettingsDraft.preferredMaxSessionsPerWeek}
            onChange={(event) => onUpdateFinancialSettingsDraft("preferredMaxSessionsPerWeek", event.target.value)}
          />
        </label>
      </div>

      <label className="admin-toggle-row">
        <input
          type="checkbox"
          checked={financialSettingsDraft.includeCashInTaxForecast}
          onChange={(event) => onUpdateFinancialSettingsDraft("includeCashInTaxForecast", event.target.checked)}
        />
        <span>Include cash payments in tax forecast</span>
      </label>

      <div className="working-rules-actions financial-settings-actions">
        <button type="button" className="admin-primary-action" disabled={!financialSettingsDirty} onClick={onSaveFinancialSettings}>
          Save
        </button>
        <span>{financialSettingsDirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>

      <div className="financial-settings-foundation">
        <div>
          <h3>Expense categories</h3>
          <p>{expenseCategories.join(", ")}</p>
        </div>
        <div>
          <h3>Expense model</h3>
          <p>Ready for date, category, amount, optional notes, recurrence, created time, and updated time.</p>
          <p>{expenses.length} expense record{expenses.length === 1 ? "" : "s"} currently stored.</p>
        </div>
      </div>
    </div>
  );
}
