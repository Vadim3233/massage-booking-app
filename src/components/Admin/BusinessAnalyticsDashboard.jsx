import React, { useMemo, useState } from "react";
import { getBookingBlocks, timeToMinutes } from "../../schedulingEngine.js";
import {
  buildFinancialOverview,
  buildForecastPlanner,
  buildGoalProgress,
  buildBusinessTarget,
  buildExpenseSummary,
  buildTaxForecast,
  DEFAULT_FINANCIAL_SETTINGS,
  EXPENSE_CATEGORIES,
  EXPENSE_RECURRENCE_LABELS,
  EXPENSE_RECURRENCES,
  filterExpenses,
  sortExpensesLatestFirst,
} from "../../lib/financialAnalytics.js";

const MONEY_FORMATTER = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  style: "currency",
});

const ANALYTICS_EXPORT_COLUMNS = [
  "date",
  "client",
  "service",
  "area",
  "status",
  "durationMinutes",
  "travelMinutes",
  "revenue",
];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function isPersonalEvent(booking) {
  if (!booking || typeof booking !== "object") return false;
  return booking.type === "personal" || booking.serviceId === "personal-event";
}

function itemsForBooking(booking) {
  if (isPersonalEvent(booking)) return [{ minutes: booking.duration, name: booking.serviceName || "Personal event" }];
  return Array.isArray(booking.items) && booking.items.length > 0
    ? booking.items
    : [{ minutes: booking.duration, name: booking.serviceName }];
}

function serviceNameFor(services, serviceId) {
  return services.find((service) => service.id === serviceId)?.name || "Treatment";
}

function formatMoney(value) {
  return MONEY_FORMATTER.format(Number(value) || 0);
}

function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function formatDate(value) {
  const date = bookingDateObject(value);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : value;
}

function bookingRevenue(booking) {
  if (isPersonalEvent(booking)) return 0;
  if (isFiniteNumber(booking.total)) return Number(booking.total);
  if (isFiniteNumber(booking.price) && Number(booking.price) > 0) {
    return Number(booking.price)
      + Number(booking.congestionFee || 0)
      + Number(booking.travelFee || 0);
  }
  const itemRevenue = itemsForBooking(booking).reduce((total, item) => total + (Number(item.price) || 0), 0);
  if (itemRevenue > 0) return itemRevenue;
  return Math.round((Number(booking.duration) || 0) * 1.1 + 35);
}

function bookingStatus(booking) {
  return String(booking.status || "confirmed").toLowerCase();
}

function bookingDateObject(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeTimeToMinutes(value, fallback) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  return timeToMinutes(value);
}

function daysBetween(firstDate, secondDate) {
  const milliseconds = bookingDateObject(secondDate)?.getTime() - bookingDateObject(firstDate)?.getTime();
  return Number.isFinite(milliseconds) ? Math.round(milliseconds / 86400000) : 0;
}

function flattenAnalyticsBookings(days) {
  return (Array.isArray(days) ? days : []).flatMap((day) => {
    const sourceDay = day && typeof day === "object" ? day : {};
    const dayBookings = Array.isArray(sourceDay.bookings)
      ? sourceDay.bookings.filter((booking) => booking && typeof booking === "object")
      : [];
    return getBookingBlocks(dayBookings)
      .filter((booking) => !isPersonalEvent(booking))
      .map((booking) => ({
        ...booking,
        area: booking.location || booking.selectedAreaName || booking.address || "Area not captured",
        dateValue: booking.dateValue || sourceDay.dateValue,
        dayLabel: sourceDay.label,
        revenue: bookingRevenue(booking),
        status: bookingStatus(booking),
      }));
  });
}

function previousPeriodRange(date, period) {
  const start = new Date(date);
  const end = new Date(date);

  if (period === "day") {
    start.setDate(date.getDate() - 1);
    end.setDate(date.getDate() - 1);
  } else if (period === "week") {
    start.setDate(date.getDate() - 14);
    end.setDate(date.getDate() - 7);
  } else if (period === "month") {
    start.setMonth(date.getMonth() - 1, 1);
    end.setMonth(date.getMonth(), 0);
  } else if (period === "year") {
    start.setFullYear(date.getFullYear() - 1, 0, 1);
    end.setFullYear(date.getFullYear() - 1, 11, 31);
  }

  return { end, start };
}

function currentPeriodRange(date, period) {
  const start = new Date(date);
  const end = new Date(date);

  if (period === "day") {
    return { end, start };
  }

  if (period === "week") {
    const mondayOffset = (date.getDay() + 6) % 7;
    start.setDate(date.getDate() - mondayOffset);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(date.getMonth() + 1, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }

  return { end, start };
}

function isBookingInsideRange(booking, range) {
  const date = bookingDateObject(booking.dateValue);
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

function sumRevenue(bookings) {
  return bookings.reduce((total, booking) => total + booking.revenue, 0);
}

function percentageChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function buildRevenueCard(bookings, label, period, today) {
  const currentRange = currentPeriodRange(today, period);
  const previousRange = previousPeriodRange(today, period);
  const current = sumRevenue(bookings.filter((booking) => isBookingInsideRange(booking, currentRange)));
  const previous = sumRevenue(bookings.filter((booking) => isBookingInsideRange(booking, previousRange)));
  return {
    change: percentageChange(current, previous),
    label,
    value: current,
  };
}

function monthKeyForDate(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue.slice(0, 7) : "Unknown";
}

function monthLabel(monthKey) {
  const date = new Date(`${monthKey}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? monthKey : date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function groupedAnalyticsRows(bookings, keyForBooking) {
  const map = new Map();
  bookings.forEach((booking) => {
    const key = keyForBooking(booking) || "Unassigned";
    const current = map.get(key) ?? { bookings: 0, key, revenue: 0 };
    current.bookings += 1;
    current.revenue += booking.revenue;
    map.set(key, current);
  });
  return [...map.values()]
    .map((row) => ({ ...row, average: row.bookings ? row.revenue / row.bookings : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

function downloadTextFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function analyticsRowsToCsv(rows) {
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    ANALYTICS_EXPORT_COLUMNS.join(","),
    ...rows.map((row) => ANALYTICS_EXPORT_COLUMNS.map((column) => escapeCell(row[column])).join(",")),
  ].join("\n");
}

function businessHealthStatus(score) {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Fair";
  return "Poor";
}

function createEmptyExpenseForm() {
  return {
    amount: "",
    category: EXPENSE_CATEGORIES[0],
    date: todayValue(),
    notes: "",
    recurrence: "one_time",
  };
}

const ANALYTICS_CATEGORIES = [
  { id: "overview", label: "Overview", summary: "Business summary and key highlights." },
  { id: "money", label: "Money", summary: "Revenue, expenses, profit, and monthly trends." },
  { id: "goals", label: "Business Target", summary: "Progress against your annual revenue target." },
  { id: "expenses", label: "Expenses", summary: "Record, filter, edit, and delete costs." },
  { id: "tax", label: "Tax", summary: "Tax forecast, tax pot, deadline, and cash inclusion." },
  { id: "forecast", label: "Forecast Planner", summary: "Bookings and hours needed to reach your target." },
  { id: "bookings", label: "Bookings", summary: "Appointment volume and booking health." },
  { id: "clients", label: "Clients", summary: "Retention, top clients, and repeat booking rate." },
  { id: "services-areas", label: "Services & Areas", summary: "Treatment and area performance." },
  { id: "efficiency", label: "Working Efficiency", summary: "Rates, travel, utilisation, and efficiency metrics." },
  { id: "insights", label: "Insights", summary: "Actionable insights and recommendations." },
];

export function BusinessAnalyticsDashboard({
  days,
  expenseCategories = EXPENSE_CATEGORIES,
  expenses = [],
  financialSettings = DEFAULT_FINANCIAL_SETTINGS,
  onAddExpense = () => {},
  onDeleteExpense = () => {},
  onUpdateExpense = () => {},
  serviceDetails = {},
  services,
  settings,
}) {
  const safeDays = Array.isArray(days) ? days : [];
  const safeServices = Array.isArray(services) ? services : [];
  const safeSettings = {
    workingEnd: "18:00",
    workingStart: "09:00",
    ...(settings && typeof settings === "object" ? settings : {}),
  };
  const safeFinancialSettings = financialSettings && typeof financialSettings === "object"
    ? financialSettings
    : DEFAULT_FINANCIAL_SETTINGS;
  const safeServiceDetails = serviceDetails && typeof serviceDetails === "object" ? serviceDetails : {};
  const [range, setRange] = useState("6");
  const [areaSort, setAreaSort] = useState("revenue");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("all");
  const [expensePeriodFilter, setExpensePeriodFilter] = useState("current_month");
  const [expenseDraft, setExpenseDraft] = useState(createEmptyExpenseForm);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseError, setExpenseError] = useState("");
  const [activeAnalyticsCategory, setActiveAnalyticsCategory] = useState("");
  const bookings = useMemo(() => flattenAnalyticsBookings(safeDays), [safeDays]);
  const today = useMemo(() => bookingDateObject(todayValue()) || new Date(), []);
  const allExpenses = useMemo(() => sortExpensesLatestFirst(expenses), [expenses]);
  const serviceForecastDefaults = useMemo(() => safeServices.map((service) => ({
    duration: safeServiceDetails[service.id]?.duration,
    price: safeServiceDetails[service.id]?.price,
  })), [safeServices, safeServiceDetails]);
  const filteredExpenses = useMemo(() => filterExpenses(allExpenses, {
    category: expenseCategoryFilter,
    period: expensePeriodFilter,
    settings: safeFinancialSettings,
    todayValue: todayValue(),
  }), [allExpenses, expenseCategoryFilter, expensePeriodFilter, safeFinancialSettings]);
  const expenseSummary = useMemo(() => buildExpenseSummary(allExpenses, safeFinancialSettings, todayValue()), [allExpenses, safeFinancialSettings]);
  const lifetimeRevenue = sumRevenue(bookings);
  const financialOverview = useMemo(() => buildFinancialOverview({
    bookings,
    expenses: allExpenses,
    settings: safeFinancialSettings,
    todayValue: todayValue(),
  }), [allExpenses, bookings, safeFinancialSettings]);
  const goalProgress = useMemo(() => buildGoalProgress(financialOverview, safeFinancialSettings), [financialOverview, safeFinancialSettings]);
  const taxForecast = useMemo(() => buildTaxForecast({
    bookings,
    expenses: allExpenses,
    settings: safeFinancialSettings,
    todayValue: todayValue(),
  }), [allExpenses, bookings, safeFinancialSettings]);
  const forecastPlanner = useMemo(() => buildForecastPlanner({
    bookings,
    days: safeDays,
    serviceDefaults: serviceForecastDefaults,
    settings: safeFinancialSettings,
    todayValue: todayValue(),
  }), [bookings, safeDays, safeFinancialSettings, serviceForecastDefaults]);
  const businessTarget = useMemo(() => buildBusinessTarget({
    forecastPlanner,
    overview: financialOverview,
    settings: safeFinancialSettings,
    taxForecast,
  }), [financialOverview, forecastPlanner, safeFinancialSettings, taxForecast]);
  const revenueCards = [
    buildRevenueCard(bookings, "Today's Revenue", "day", today),
    buildRevenueCard(bookings, "This Week Revenue", "week", today),
    buildRevenueCard(bookings, "This Month Revenue", "month", today),
    buildRevenueCard(bookings, "This Year Revenue", "year", today),
    { change: 0, label: "Lifetime Revenue", value: lifetimeRevenue },
  ];
  const statusCounts = bookings.reduce((counts, booking) => {
    counts[booking.status] = (counts[booking.status] || 0) + 1;
    return counts;
  }, {});
  const upcomingBookings = bookings.filter((booking) => daysBetween(todayValue(), booking.dateValue) >= 0 && booking.status !== "cancelled").length;
  const completedBookings = bookings.filter((booking) => daysBetween(booking.dateValue, todayValue()) > 0 && !["cancelled", "refunded", "no-show"].includes(booking.status)).length;
  const cancelledBookings = statusCounts.cancelled || 0;
  const refundedBookings = statusCounts.refunded || 0;
  const noShowBookings = statusCounts["no-show"] || statusCounts.no_show || 0;
  const totalBookings = bookings.length;
  const rate = (count) => totalBookings ? Math.round((count / totalBookings) * 100) : 0;
  const monthRows = groupedAnalyticsRows(bookings, (booking) => monthKeyForDate(booking.dateValue));
  const graphRows = range === "all" ? monthRows : monthRows.slice(0, Number(range)).reverse();
  const graphMax = Math.max(1, ...graphRows.map((row) => row.revenue));
  const serviceRows = groupedAnalyticsRows(bookings, (booking) => booking.serviceName || serviceNameFor(safeServices, booking.serviceId));
  const areaRows = groupedAnalyticsRows(bookings, (booking) => booking.area)
    .sort((a, b) => areaSort === "bookings" ? b.bookings - a.bookings : areaSort === "average" ? b.average - a.average : b.revenue - a.revenue);
  const clientRows = groupedAnalyticsRows(bookings, (booking) => booking.clientName || booking.customerEmail || "Private client").slice(0, 10);
  const clients = new Set(bookings.map((booking) => booking.clientName || booking.customerEmail || booking.id));
  const monthRange = currentPeriodRange(today, "month");
  const newClientsThisMonth = new Set(bookings.filter((booking) => isBookingInsideRange(booking, monthRange)).map((booking) => booking.clientName || booking.customerEmail || booking.id)).size;
  const returningClients = clientRows.filter((client) => client.bookings > 1).length;
  const repeatRate = clients.size ? Math.round((returningClients / clients.size) * 100) : 0;
  const treatmentHours = bookings.reduce((total, booking) => total + (Number(booking.duration) || 0), 0) / 60;
  const travelHours = bookings.reduce((total, booking) => total + (Number(booking.travelBuffer) || 0), 0) / 60;
  const treatmentRate = treatmentHours ? lifetimeRevenue / treatmentHours : 0;
  const trueWorkingRate = treatmentHours + travelHours ? lifetimeRevenue / (treatmentHours + travelHours) : 0;
  const workingStart = safeTimeToMinutes(safeSettings.workingStart, 540);
  const workingEnd = safeTimeToMinutes(safeSettings.workingEnd, 1080);
  const availableHours = Math.max(0, (workingEnd - workingStart) / 60) * Math.max(1, safeDays.length);
  const utilisation = availableHours ? Math.round((treatmentHours / availableHours) * 100) : 0;
  const utilisationStatus = utilisation >= 70 ? "green" : utilisation >= 50 ? "amber" : "red";
  const revenueGrowth = revenueCards[2].change;
  const averageBookingValue = totalBookings ? lifetimeRevenue / totalBookings : 0;
  const healthScore = Math.max(0, Math.min(100, Math.round(
    50 +
    Math.min(18, Math.max(-12, revenueGrowth / 2)) +
    Math.min(18, repeatRate / 4) -
    Math.min(15, rate(cancelledBookings) / 2) +
    Math.min(18, utilisation / 5) +
    Math.min(12, averageBookingValue / 18)
  )));
  const topService = serviceRows[0];
  const topArea = areaRows[0];
  const insights = [
    topService ? `${topService.key} is currently your highest revenue treatment.` : "Add confirmed bookings to unlock treatment performance insights.",
    topArea ? `${topArea.key} generated ${totalBookings ? Math.round((topArea.bookings / totalBookings) * 100) : 0}% of recorded appointments.` : "Area performance will appear once bookings include areas.",
    repeatRate > 0 ? `Repeat booking rate is ${repeatRate}%, a useful signal for client retention.` : "Encourage returning clients with a calm follow-up after each treatment.",
    rate(cancelledBookings) > 15 ? "Cancellation rate is higher than ideal this period." : "Cancellation rate is currently controlled.",
  ];
  const overviewWarnings = [
    rate(cancelledBookings) > 15 ? `Cancellation rate is ${rate(cancelledBookings)}%, which may need attention.` : "",
    forecastPlanner.workloadWarning ? "Your revenue target may exceed your preferred weekly workload." : "",
    safeFinancialSettings.annualRevenueGoal <= 0 ? "Set an annual revenue target to unlock useful forecasting." : "",
    taxForecast.taxPotProgress.hasGoal && taxForecast.taxPotProgress.percentage < 50 ? "Tax pot is below half of the current tax/NI estimate." : "",
  ].filter(Boolean).slice(0, 2);
  const projectedAnnualRevenue = forecastPlanner.annualRevenueGoal > 0
    ? Math.max(forecastPlanner.currentRevenue, forecastPlanner.scenarios.find((scenario) => scenario.id === "current")?.projectedRevenue || 0)
    : financialOverview.revenueThisTaxYear;
  const extraBookingsNeeded = Math.max(0, Math.ceil(forecastPlanner.requiredBookingsPerWeek));
  const businessSummaryLines = totalBookings === 0
    ? [
        "No booking revenue is recorded yet.",
        allExpenses.length > 0
          ? `You have recorded ${formatMoney(financialOverview.expensesThisMonth)} in business expenses this month.`
          : "Once appointments and expenses are added, this page will turn them into a simple business snapshot.",
        safeFinancialSettings.annualRevenueGoal > 0
          ? `Your annual revenue target is set at ${formatMoney(safeFinancialSettings.annualRevenueGoal)}.`
          : "Set an annual revenue target to unlock forecasting.",
        "No urgent issues detected.",
      ]
    : [
        `This month you earned ${formatMoney(financialOverview.revenueThisMonth)} and spent ${formatMoney(financialOverview.expensesThisMonth)} on business expenses, leaving an estimated profit of ${formatMoney(financialOverview.profitThisMonth)}.`,
        `You currently have ${upcomingBookings} upcoming appointment${upcomingBookings === 1 ? "" : "s"} booked.`,
        safeFinancialSettings.annualRevenueGoal > 0
          ? `At your current pace, the business is projected to generate approximately ${formatMoney(projectedAnnualRevenue)} this tax year, with estimated take-home of ${formatMoney(businessTarget.estimatedTakeHome)}.`
          : "Set an annual revenue target to unlock forecasting.",
        safeFinancialSettings.annualRevenueGoal > 0 && extraBookingsNeeded > 0
          ? `To reach your annual revenue target, you may need around ${extraBookingsNeeded} additional booking${extraBookingsNeeded === 1 ? "" : "s"} per week.`
          : "",
        repeatRate > 0
          ? `Your repeat booking rate is currently ${repeatRate}%.`
          : "Focus on encouraging repeat bookings from existing clients.",
        forecastPlanner.workloadWarning
          ? "Your revenue target may require more sessions than your preferred weekly workload."
          : taxForecast.taxPotProgress.hasGoal && taxForecast.taxPotProgress.percentage < 50
            ? "Consider setting aside money for your future tax bill."
            : repeatRate > 0 && repeatRate < 25
              ? "Focus on encouraging repeat bookings from existing clients."
              : "No urgent issues detected.",
      ].filter(Boolean).slice(0, 6);
  const exportRows = bookings.map((booking) => ({
    area: booking.area,
    client: booking.clientName || booking.customerEmail || "Private client",
    date: booking.dateValue,
    durationMinutes: booking.duration,
    revenue: booking.revenue,
    service: booking.serviceName,
    status: booking.status,
    travelMinutes: booking.travelBuffer,
  }));
  const csv = analyticsRowsToCsv(exportRows);

  function exportCsv() {
    downloadTextFile("vad-massage-analytics.csv", csv, "text/csv");
  }

  function exportExcel() {
    downloadTextFile("vad-massage-analytics.xls", csv, "application/vnd.ms-excel");
  }

  function exportPdfSummary() {
    window.print();
  }

  function updateExpenseDraft(field, value) {
    setExpenseDraft((current) => ({ ...current, [field]: value }));
    setExpenseError("");
  }

  function resetExpenseForm() {
    setExpenseDraft(createEmptyExpenseForm());
    setEditingExpenseId(null);
    setExpenseError("");
  }

  function submitExpense(event) {
    event.preventDefault();
    const amount = Number(expenseDraft.amount);
    if (!expenseDraft.date) {
      setExpenseError("Choose an expense date.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setExpenseError("Enter an expense amount greater than zero.");
      return;
    }

    if (editingExpenseId) {
      onUpdateExpense(editingExpenseId, expenseDraft);
    } else {
      onAddExpense(expenseDraft);
    }
    resetExpenseForm();
  }

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setExpenseDraft({
      amount: String(expense.amount),
      category: expense.category,
      date: expense.date,
      notes: expense.notes,
      recurrence: expense.recurrence,
    });
    setExpenseError("");
  }

  function requestDeleteExpense(expense) {
    const confirmed = window.confirm(`Delete ${expense.category} expense from ${formatDate(expense.date)}?`);
    if (!confirmed) return;
    onDeleteExpense(expense.id);
    if (editingExpenseId === expense.id) resetExpenseForm();
  }

  const activeCategory = ANALYTICS_CATEGORIES.find((category) => category.id === activeAnalyticsCategory);

  return (
    <section className={`admin-screen analytics-dashboard ${activeAnalyticsCategory ? `analytics-show-${activeAnalyticsCategory}` : "analytics-show-menu"}`}>
      <div className="admin-screen-heading analytics-hero-heading">
        <div>
          <p>Business Analytics</p>
          <h2>{activeCategory?.label || "Analytics"}</h2>
          <span>{activeCategory?.summary || "Understand your business at a glance."}</span>
        </div>
        <details className="analytics-export-actions">
          <summary>Export</summary>
          <div>
            <button type="button" onClick={exportCsv}>CSV</button>
            <button type="button" onClick={exportExcel}>Excel</button>
            <button type="button" onClick={exportPdfSummary}>PDF</button>
          </div>
        </details>
      </div>

      {activeAnalyticsCategory && (
        <button type="button" className="settings-folder-back analytics-back-button" onClick={() => setActiveAnalyticsCategory("")}>
          <span aria-hidden="true">&lt;</span>
          Back to Analytics
        </button>
      )}

      <section className="analytics-panel business-summary-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Business Summary</p>
            <h3>10-second snapshot</h3>
          </div>
        </div>
        <div className="business-summary-list">
          {businessSummaryLines.map((line) => <p key={line}>{line}</p>)}
        </div>
      </section>

      <h3 className="analytics-areas-title">Analytics Areas</h3>
      <div className="analytics-category-menu">
        {ANALYTICS_CATEGORIES.map((category, index) => (
          <button
            type="button"
            className="analytics-explorer-card"
            key={category.id}
            onClick={() => setActiveAnalyticsCategory(category.id)}
          >
            <span className="analytics-category-number">{index + 1}</span>
            <span className="analytics-category-icon" aria-hidden="true">{category.label.charAt(0)}</span>
            <strong>{category.label}</strong>
            <small>{category.summary}</small>
            <span className="analytics-category-chevron" aria-hidden="true">&gt;</span>
          </button>
        ))}
      </div>

      <div className="analytics-card-grid financial-card-grid">
        {[
          revenueCards[0],
          revenueCards[1],
          revenueCards[2],
          { change: 0, label: "Tax-Year Revenue", value: financialOverview.revenueThisTaxYear },
          { change: 0, label: "Tax-Year Profit", value: financialOverview.profitThisTaxYear },
        ].map((card) => (
          <article className="analytics-metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{formatMoney(card.value)}</strong>
            {card.label.startsWith("Tax-Year") ? null : (
              <small className={card.change >= 0 ? "positive-trend" : "negative-trend"}>
                {card.change >= 0 ? "Up" : "Down"} {Math.abs(card.change)}% vs previous period
              </small>
            )}
          </article>
        ))}
      </div>

      <section className="analytics-panel overview-warning-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Warnings</p>
            <h3>Needs attention</h3>
          </div>
        </div>
        <div className="insight-list">
          {overviewWarnings.length === 0 ? (
            <article>No urgent analytics warnings right now.</article>
          ) : overviewWarnings.map((warning) => <article key={warning}>{warning}</article>)}
        </div>
      </section>

      <section className="analytics-panel financial-overview-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Overview</p>
            <h3>Revenue, expenses, and profit</h3>
          </div>
        </div>
        <div className="analytics-card-grid financial-overview-grid">
          {[
            ["Revenue this month", financialOverview.revenueThisMonth],
            ["Revenue current tax year", financialOverview.revenueThisTaxYear],
            ["Expenses this month", financialOverview.expensesThisMonth],
            ["Expenses current tax year", financialOverview.expensesThisTaxYear],
            ["Profit this month", financialOverview.profitThisMonth],
            ["Profit current tax year", financialOverview.profitThisTaxYear],
          ].map(([label, value]) => (
            <article className="analytics-metric-card" key={label}>
              <span>{label}</span>
              <strong>{formatMoney(value)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="analytics-panel financial-goals-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Business Target</p>
            <h3>Annual Revenue Target</h3>
          </div>
        </div>
        {businessTarget.hasTarget ? (
          <div className="goal-progress-list business-target-list">
            <article className="goal-progress-card business-target-primary-card">
              <div>
                <span>Annual Revenue Target</span>
                <strong>{formatMoney(businessTarget.currentTaxYearRevenue)} / {formatMoney(businessTarget.annualRevenueTarget)}</strong>
              </div>
              <b>{formatPercent(businessTarget.progress.percentage)}</b>
              <div className="goal-progress-bar" aria-label={`Annual Revenue Target ${businessTarget.progress.percentage}% complete`}>
                <i style={{ width: `${Math.min(100, businessTarget.progress.percentage)}%` }} />
              </div>
            </article>
            {[
              ["Projected tax-year revenue", businessTarget.projectedTaxYearRevenue],
              ["Estimated expenses", businessTarget.estimatedExpenses],
              ["Estimated profit", businessTarget.estimatedProfit],
              ["Estimated tax/NI", businessTarget.estimatedTaxAndNi],
              ["Estimated take-home", businessTarget.estimatedTakeHome],
            ].map(([label, value]) => (
              <article className="analytics-metric-card" key={label}>
                <span>{label}</span>
                <strong>{formatMoney(value)}</strong>
              </article>
            ))}
            <article className="analytics-metric-card">
              <span>Required bookings per week</span>
              <strong>{businessTarget.requiredBookingsPerWeek.toFixed(1)}</strong>
            </article>
            <article className="analytics-metric-card">
              <span>Required treatment hours per week</span>
              <strong>{businessTarget.requiredTreatmentHoursPerWeek.toFixed(1)}h</strong>
            </article>
            {businessTarget.workloadWarning && (
              <p className="forecast-workload-warning">
                This target may exceed your preferred workload. Consider increasing prices, reducing the target, or extending the timeline.
              </p>
            )}
          </div>
        ) : (
          <div className="goal-progress-list">
            <article className="goal-progress-card empty-goal-card">
              <div>
                <span>Annual Revenue Target</span>
                <strong>No target set</strong>
              </div>
              <p>Set this in Settings &gt; Financial Settings.</p>
            </article>
            <article className="analytics-metric-card">
              <span>Estimated profit</span>
              <strong>{formatMoney(businessTarget.estimatedProfit)}</strong>
            </article>
            <article className="analytics-metric-card">
              <span>Estimated take-home</span>
              <strong>{formatMoney(businessTarget.estimatedTakeHome)}</strong>
            </article>
          </div>
        )}
        {goalProgress.find((goal) => goal.id === "monthlyRevenueGoal")?.hasGoal && (
          <div className="goal-progress-list secondary-target-list">
            {goalProgress.filter((goal) => goal.id === "monthlyRevenueGoal").map((goal) => (
              <article className="goal-progress-card" key={goal.id}>
                <div>
                  <span>{goal.label}</span>
                  <strong>{formatMoney(goal.achieved)} / {formatMoney(goal.target)}</strong>
                </div>
                <b>{formatPercent(goal.percentage)}</b>
                <div className="goal-progress-bar" aria-label={`${goal.label} ${goal.percentage}% complete`}>
                  <i style={{ width: `${Math.min(100, goal.percentage)}%` }} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="analytics-panel tax-forecast-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Tax</p>
            <h3>Tax forecast</h3>
          </div>
        </div>
        <div className="tax-forecast-grid">
          <div><span>Current tax year</span><strong>{formatDate(taxForecast.taxYearRange.start)} - {formatDate(taxForecast.taxYearRange.end)}</strong></div>
          <div><span>Revenue included</span><strong>{formatMoney(taxForecast.revenueIncluded)}</strong></div>
          <div><span>Expenses</span><strong>{formatMoney(taxForecast.expenses)}</strong></div>
          <div><span>Estimated profit</span><strong>{formatMoney(taxForecast.estimatedProfit)}</strong></div>
          <div><span>Estimated Income Tax</span><strong>{formatMoney(taxForecast.taxEstimate.estimatedIncomeTax)}</strong></div>
          <div><span>Estimated National Insurance</span><strong>{formatMoney(taxForecast.taxEstimate.estimatedNationalInsurance)}</strong></div>
          <div><span>Estimated total tax/NI</span><strong>{formatMoney(taxForecast.taxEstimate.estimatedTotalTaxAndNi)}</strong></div>
          <div><span>Tax pot saved</span><strong>{formatMoney(taxForecast.taxPotSavedAmount)}</strong></div>
          <div><span>Self Assessment deadline</span><strong>{formatDate(taxForecast.deadline.date)}</strong><small>{taxForecast.deadline.daysRemaining} days remaining</small></div>
        </div>
        {!safeFinancialSettings.includeCashInTaxForecast && (
          <p className="tax-cash-exclusion-note">Excluded from forecast: {formatMoney(taxForecast.excludedCashRevenue)} cash revenue.</p>
        )}
        <div className="tax-pot-progress">
          <div>
            <span>Tax pot progress</span>
            <strong>{formatMoney(taxForecast.taxPotProgress.achieved)} / {formatMoney(taxForecast.taxPotProgress.target)}</strong>
          </div>
          <b>{formatPercent(taxForecast.taxPotProgress.percentage)}</b>
          <div className="goal-progress-bar" aria-label={`Tax pot ${taxForecast.taxPotProgress.percentage}% funded`}>
            <i style={{ width: `${Math.min(100, taxForecast.taxPotProgress.percentage)}%` }} />
          </div>
        </div>
        <p className="tax-forecast-note">Forecast only. Confirm your tax position with an accountant or HMRC.</p>
      </section>

      <section className="analytics-panel forecast-planner-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Forecast Planner</p>
            <h3>Target workload estimate</h3>
          </div>
        </div>
        {forecastPlanner.annualRevenueGoal <= 0 && (
          <p className="forecast-low-data-note">Set an annual revenue target first.</p>
        )}
        <div className={forecastPlanner.annualRevenueGoal <= 0 ? "forecast-planner-grid forecast-zero-goal-hidden" : "forecast-planner-grid"}>
          <div><span>Current tax-year revenue</span><strong>{formatMoney(forecastPlanner.currentRevenue)}</strong></div>
          <div><span>Annual Revenue Target</span><strong>{formatMoney(forecastPlanner.annualRevenueGoal)}</strong></div>
          <div><span>Remaining revenue needed</span><strong>{formatMoney(forecastPlanner.remainingRevenueNeeded)}</strong></div>
          <div><span>Remaining tax-year days</span><strong>{forecastPlanner.remainingTaxYearDays}</strong></div>
          <div><span>Remaining working days</span><strong>{forecastPlanner.remainingWorkingDays}</strong></div>
          <div><span>Remaining working weeks</span><strong>{forecastPlanner.remainingWorkingWeeks.toFixed(1)}</strong></div>
        </div>
        <div className={forecastPlanner.annualRevenueGoal <= 0 ? "forecast-requirements-grid forecast-zero-goal-hidden" : "forecast-requirements-grid"}>
          <article>
            <span>Revenue per working week</span>
            <strong>{formatMoney(forecastPlanner.requiredRevenuePerWorkingWeek)}</strong>
          </article>
          <article>
            <span>Bookings per week</span>
            <strong>{forecastPlanner.requiredBookingsPerWeek.toFixed(1)}</strong>
            <small>Based on {formatMoney(forecastPlanner.averageBookingValue)} average booking value</small>
          </article>
          <article>
            <span>Treatment hours per week</span>
            <strong>{forecastPlanner.requiredTreatmentHoursPerWeek.toFixed(1)}h</strong>
            <small>Based on {forecastPlanner.averageTreatmentDuration} min average duration</small>
          </article>
        </div>
        {forecastPlanner.annualRevenueGoal > 0 && forecastPlanner.usesFallbackPricing && (
          <p className="forecast-low-data-note">Forecast uses your current prices until more booking history is available.</p>
        )}
        {forecastPlanner.annualRevenueGoal > 0 && forecastPlanner.workloadWarning && (
          <p className="forecast-workload-warning">
            This target may exceed your preferred workload. Consider increasing prices, reducing the target, or extending the timeline.
          </p>
        )}
        <div className={forecastPlanner.annualRevenueGoal <= 0 ? "forecast-scenario-grid forecast-zero-goal-hidden" : "forecast-scenario-grid"}>
          {forecastPlanner.scenarios.map((scenario) => {
            const progress = forecastPlanner.annualRevenueGoal > 0
              ? Math.min(100, Math.round((scenario.projectedRevenue / forecastPlanner.annualRevenueGoal) * 100))
              : 0;
            return (
              <article className="forecast-scenario-card" key={scenario.id}>
                <span>{scenario.label}</span>
                <strong>{formatMoney(scenario.projectedRevenue)}</strong>
                <small>{scenario.bookingsPerWeek.toFixed(1)} bookings/week projected</small>
                <div className="goal-progress-bar" aria-label={`${scenario.label} ${progress}% of annual revenue target`}>
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small>{forecastPlanner.annualRevenueGoal <= 0 ? "Set an annual revenue target first." : scenario.shortfall > 0 ? `${formatMoney(scenario.shortfall)} short` : "Target reached"}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="analytics-panel analytics-expenses-panel" id="admin-analytics-expenses">
        <div className="analytics-panel-heading">
          <div>
            <p>Expenses</p>
            <h3>Expense tracking</h3>
          </div>
        </div>

        <div className="analytics-card-grid expense-summary-grid">
          <article className="analytics-metric-card">
            <span>Expenses this month</span>
            <strong>{formatMoney(expenseSummary.expensesThisMonth)}</strong>
            <small>Current calendar month</small>
          </article>
          <article className="analytics-metric-card">
            <span>Expenses this tax year</span>
            <strong>{formatMoney(expenseSummary.expensesThisTaxYear)}</strong>
            <small>Based on financial settings</small>
          </article>
          <article className="analytics-metric-card">
            <span>Biggest category this tax year</span>
            <strong>{expenseSummary.biggestCategoryThisTaxYear?.category || "None yet"}</strong>
            <small>{expenseSummary.biggestCategoryThisTaxYear ? formatMoney(expenseSummary.biggestCategoryThisTaxYear.amount) : "No expenses recorded"}</small>
          </article>
        </div>

        <form className="expense-form" onSubmit={submitExpense}>
          <label>
            <span>Date</span>
            <input type="date" value={expenseDraft.date} onChange={(event) => updateExpenseDraft("date", event.target.value)} />
          </label>
          <label>
            <span>Category</span>
            <select value={expenseDraft.category} onChange={(event) => updateExpenseDraft("category", event.target.value)}>
              {expenseCategories.map((category) => <option value={category} key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            <span>Amount (£)</span>
            <input type="number" min="0" step="0.01" value={expenseDraft.amount} onChange={(event) => updateExpenseDraft("amount", event.target.value)} />
          </label>
          <label>
            <span>Recurrence</span>
            <select value={expenseDraft.recurrence} onChange={(event) => updateExpenseDraft("recurrence", event.target.value)}>
              {EXPENSE_RECURRENCES.map((recurrence) => (
                <option value={recurrence} key={recurrence}>{EXPENSE_RECURRENCE_LABELS[recurrence]}</option>
              ))}
            </select>
          </label>
          <label className="expense-notes-field">
            <span>Notes</span>
            <input value={expenseDraft.notes} onChange={(event) => updateExpenseDraft("notes", event.target.value)} placeholder="Optional note" />
          </label>
          <div className="expense-form-actions">
            <button type="submit" className="admin-primary-action">{editingExpenseId ? "Save expense" : "Add expense"}</button>
            {editingExpenseId && <button type="button" className="admin-secondary-action" onClick={resetExpenseForm}>Cancel edit</button>}
          </div>
          {expenseError && <p className="admin-action-message" role="alert">{expenseError}</p>}
        </form>

        <div className="expense-filter-row">
          <label>
            <span>Category filter</span>
            <select value={expenseCategoryFilter} onChange={(event) => setExpenseCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {expenseCategories.map((category) => <option value={category} key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            <span>Period filter</span>
            <select value={expensePeriodFilter} onChange={(event) => setExpensePeriodFilter(event.target.value)}>
              <option value="current_month">Current month</option>
              <option value="current_tax_year">Current tax year</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        <div className="expense-list">
          {filteredExpenses.length === 0 ? (
            <p className="muted-copy">No expenses recorded yet.</p>
          ) : filteredExpenses.map((expense) => (
            <article className="expense-list-card" key={expense.id}>
              <div>
                <span>{formatDate(expense.date)}</span>
                <strong>{expense.category}</strong>
                <small>{EXPENSE_RECURRENCE_LABELS[expense.recurrence] || expense.recurrence}</small>
                {expense.notes && <p>{expense.notes}</p>}
              </div>
              <b>{formatMoney(expense.amount)}</b>
              <div className="expense-list-actions">
                <button type="button" className="admin-secondary-action" onClick={() => startEditingExpense(expense)}>Edit</button>
                <button type="button" className="admin-danger-option" onClick={() => requestDeleteExpense(expense)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="analytics-two-column booking-analytics-section">
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Bookings Overview</p>
              <h3>Appointment health</h3>
            </div>
          </div>
          <div className="booking-health-grid">
            {[
              ["Total Bookings", totalBookings],
              ["Completed", completedBookings],
              ["Upcoming", upcomingBookings],
              ["Cancelled", cancelledBookings],
              ["Refunded", refundedBookings],
              ["No-Shows", noShowBookings],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="rate-strip">
            <span>Cancellation Rate <b>{rate(cancelledBookings)}%</b></span>
            <span>Refund Rate <b>{rate(refundedBookings)}%</b></span>
            <span>No-Show Rate <b>{rate(noShowBookings)}%</b></span>
          </div>
        </section>

        <section className="analytics-panel health-score-panel">
          <div>
            <p>Business Health Score</p>
            <strong>{healthScore}</strong>
            <span>{businessHealthStatus(healthScore)}</span>
          </div>
          <div className="health-score-ring" style={{ "--score": `${healthScore}%` }} aria-label={`Business health score ${healthScore} out of 100`} />
        </section>
      </div>

      <section className="analytics-panel monthly-revenue-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Monthly Revenue Graph</p>
            <h3>Revenue by month</h3>
          </div>
          <div className="analytics-segmented-control">
            {[
              ["3", "3 months"],
              ["6", "6 months"],
              ["12", "12 months"],
              ["all", "All time"],
            ].map(([id, label]) => (
              <button type="button" className={range === id ? "active-analytics-filter" : ""} onClick={() => setRange(id)} key={id}>{label}</button>
            ))}
          </div>
        </div>
        <div className="revenue-bar-chart">
          {graphRows.length === 0 ? (
            <p className="muted-copy">No revenue recorded yet.</p>
          ) : graphRows.map((row) => (
            <div className="revenue-bar-row" key={row.key}>
              <span>{monthLabel(row.key)}</span>
              <div><i style={{ width: `${Math.max(6, (row.revenue / graphMax) * 100)}%` }} /></div>
              <strong>{formatMoney(row.revenue)}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="analytics-two-column service-area-analytics-section">
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Service Performance</p>
              <h3>Revenue by treatment</h3>
            </div>
          </div>
          <div className="analytics-table">
            {serviceRows.map((row) => (
              <div className="analytics-table-row" key={row.key}>
                <strong>{row.key}</strong>
                <span>{row.bookings} bookings</span>
                <b>{formatMoney(row.revenue)}</b>
                <small>{formatMoney(row.average)} avg</small>
              </div>
            ))}
            {serviceRows.length === 0 && <p className="muted-copy">Treatment performance appears after bookings are confirmed.</p>}
          </div>
        </section>

        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Area Performance</p>
              <h3>Revenue by area</h3>
            </div>
            <select value={areaSort} onChange={(event) => setAreaSort(event.target.value)} aria-label="Sort area performance">
              <option value="revenue">Revenue</option>
              <option value="bookings">Bookings</option>
              <option value="average">Average spend</option>
            </select>
          </div>
          <div className="analytics-table">
            {areaRows.map((row) => (
              <div className="analytics-table-row" key={row.key}>
                <strong>{row.key}</strong>
                <span>{row.bookings} bookings</span>
                <b>{formatMoney(row.revenue)}</b>
                <small>{formatMoney(row.average)} avg</small>
              </div>
            ))}
            {areaRows.length === 0 && <p className="muted-copy">Area performance appears after bookings include an area.</p>}
          </div>
        </section>
      </div>

      <div className="analytics-two-column client-analytics-section">
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Client Analytics</p>
              <h3>Retention overview</h3>
            </div>
          </div>
          <div className="client-analytics-grid">
            <div><span>Total Clients</span><strong>{clients.size}</strong></div>
            <div><span>New This Month</span><strong>{newClientsThisMonth}</strong></div>
            <div><span>Returning Clients</span><strong>{returningClients}</strong></div>
            <div><span>Repeat Booking Rate</span><strong>{repeatRate}%</strong></div>
          </div>
          <div className="new-returning-chart">
            <span style={{ width: `${Math.max(0, 100 - repeatRate)}%` }}>New</span>
            <b style={{ width: `${repeatRate}%` }}>Returning</b>
          </div>
        </section>

        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Top Clients</p>
              <h3>Lifetime spend</h3>
            </div>
          </div>
          <div className="analytics-table compact-client-table">
            {clientRows.map((row) => (
              <div className="analytics-table-row" key={row.key}>
                <strong>{row.key}</strong>
                <span>{row.bookings} sessions</span>
                <b>{formatMoney(row.revenue)}</b>
              </div>
            ))}
            {clientRows.length === 0 && <p className="muted-copy">Client spend appears once bookings include client details.</p>}
          </div>
        </section>
      </div>

      <div className="analytics-card-grid operations-card-grid">
        <article className="analytics-metric-card">
          <span>Treatment Rate</span>
          <strong>{formatMoney(treatmentRate)}/hour</strong>
          <small>Revenue / treatment hours</small>
        </article>
        <article className="analytics-metric-card">
          <span>True Working Rate</span>
          <strong>{formatMoney(trueWorkingRate)}/hour</strong>
          <small>Revenue / treatment + travel hours</small>
        </article>
        <article className="analytics-metric-card">
          <span>Total Travel Time</span>
          <strong>{Math.round(travelHours)}h</strong>
          <small>Average {totalBookings ? Math.round((travelHours * 60) / totalBookings) : 0} min per booking</small>
        </article>
        <article className="analytics-metric-card">
          <span>Utilisation</span>
          <strong className={`utilisation-${utilisationStatus}`}>{utilisation}%</strong>
          <small>{treatmentHours.toFixed(1)} booked hours / {availableHours.toFixed(1)} available</small>
        </article>
      </div>

      <div className="analytics-two-column travel-analytics-section">
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Travel Analytics</p>
              <h3>Monthly operating signals</h3>
            </div>
          </div>
          <div className="booking-health-grid">
            <div><span>Congestion Charges</span><strong>{formatMoney(bookings.reduce((total, booking) => total + (Number(booking.congestionFee) || 0), 0))}</strong></div>
            <div><span>Parking Costs</span><strong>{formatMoney(0)}</strong></div>
            <div><span>Mileage</span><strong>Ready</strong></div>
            <div><span>Avg Travel</span><strong>{totalBookings ? Math.round((travelHours * 60) / totalBookings) : 0} min</strong></div>
          </div>
        </section>

        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Tax Forecast</p>
              <h3>Current reserve signal</h3>
            </div>
          </div>
          <div className="booking-health-grid">
            <div><span>Forecast profit</span><strong>{formatMoney(taxForecast.estimatedProfit)}</strong></div>
            <div><span>Tax/NI estimate</span><strong>{formatMoney(taxForecast.taxEstimate.estimatedTotalTaxAndNi)}</strong></div>
            <div><span>Tax pot saved</span><strong>{formatMoney(taxForecast.taxPotSavedAmount)}</strong></div>
          </div>
        </section>
      </div>

      <section className="analytics-panel insights-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Insights & Recommendations</p>
            <h3>Actionable notes</h3>
          </div>
        </div>
        <div className="insight-list">
          {insights.map((insight) => <article key={insight}>{insight}</article>)}
        </div>
      </section>

      <section className="analytics-panel future-ready-panel">
        <div className="analytics-panel-heading">
          <div>
            <p>Future Ready Structure</p>
            <h3>Prepared for expansion</h3>
          </div>
        </div>
        <div className="future-feature-list">
          {["Expenses", "Advertising spend", "Profit calculation", "Instagram campaign tracking", "Referral tracking", "Future therapist performance"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>
    </section>
  );
}
