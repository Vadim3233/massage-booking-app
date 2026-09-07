import assert from "node:assert/strict";
import {
  addExpense,
  buildBusinessTarget,
  buildFinancialOverview,
  buildForecastPlanner,
  buildGoalProgress,
  buildExpenseSummary,
  buildTaxForecast,
  calculateGoalProgress,
  countRemainingTaxYearDays,
  countRemainingWorkingDays,
  deleteExpense,
  DEFAULT_FINANCIAL_SETTINGS,
  estimateUkSelfEmployedTax,
  EXPENSE_CATEGORIES,
  EXPENSE_RECURRENCES,
  filterExpenses,
  getCurrentTaxYearRange,
  getAverageBookingMetrics,
  hasOnlyFinancialSettingKeys,
  normalizeExpense,
  normalizeFinancialSettings,
  sanitizeExpenses,
  updateExpense,
  updateFinancialSettings,
} from "./financialAnalytics.js";

assert.deepEqual(normalizeFinancialSettings(), DEFAULT_FINANCIAL_SETTINGS);

assert.deepEqual(
  normalizeFinancialSettings({}),
  {
    taxYearStartMonth: 4,
    taxYearStartDay: 6,
    taxYearEndMonth: 4,
    taxYearEndDay: 5,
    taxReturnDeadlineMonth: 1,
    taxReturnDeadlineDay: 31,
    includeCashInTaxForecast: true,
    monthlyRevenueGoal: 0,
    annualRevenueGoal: 0,
    monthlyProfitGoal: 0,
    annualProfitGoal: 0,
    preferredMaxSessionsPerWeek: 0,
    taxPotSavedAmount: 0,
  },
  "financial settings must include the launch defaults",
);

const savedSettings = updateFinancialSettings(DEFAULT_FINANCIAL_SETTINGS, {
  annualProfitGoal: "42000.129",
  annualRevenueGoal: "80000",
  includeCashInTaxForecast: false,
  monthlyProfitGoal: "3500",
  monthlyRevenueGoal: "6500",
  preferredMaxSessionsPerWeek: "16",
  taxPotSavedAmount: "1200.5",
});

assert.equal(savedSettings.includeCashInTaxForecast, false);
assert.equal(savedSettings.annualProfitGoal, 42000.13);
assert.equal(savedSettings.preferredMaxSessionsPerWeek, 16);
assert.equal(savedSettings.taxPotSavedAmount, 1200.5);
assert.deepEqual(normalizeFinancialSettings(savedSettings), savedSettings, "saved settings must load cleanly");

const repairedSettings = normalizeFinancialSettings({
  taxYearStartMonth: 99,
  taxYearStartDay: -1,
  monthlyRevenueGoal: -300,
  preferredMaxSessionsPerWeek: 200,
});

assert.equal(repairedSettings.taxYearStartMonth, 12);
assert.equal(repairedSettings.taxYearStartDay, 1);
assert.equal(repairedSettings.monthlyRevenueGoal, 0);
assert.equal(repairedSettings.preferredMaxSessionsPerWeek, 99);
assert.ok(hasOnlyFinancialSettingKeys(repairedSettings));

assert.deepEqual(EXPENSE_CATEGORIES, [
  "Fuel",
  "Parking",
  "Congestion Charge / ULEZ",
  "Oils / Lotions",
  "Equipment",
  "Insurance",
  "Other",
]);
assert.deepEqual(EXPENSE_RECURRENCES, ["one_time", "weekly", "monthly", "yearly"]);

const expense = normalizeExpense({
  id: "expense-1",
  date: "2026-06-20",
  category: "Fuel",
  amount: "14.239",
  notes: "Client route",
  recurrence: "weekly",
  createdAt: "2026-06-20T10:00:00.000Z",
});

assert.deepEqual(expense, {
  id: "expense-1",
  date: "2026-06-20",
  category: "Fuel",
  amount: 14.24,
  notes: "Client route",
  recurrence: "weekly",
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-06-20T10:00:00.000Z",
});

assert.deepEqual(sanitizeExpenses("not an array"), []);
assert.equal(sanitizeExpenses([{ category: "Unknown", recurrence: "daily", amount: -1 }])[0].category, "Other");
assert.equal(sanitizeExpenses([{ category: "Unknown", recurrence: "daily", amount: -1 }])[0].recurrence, "one_time");
assert.equal(sanitizeExpenses([{ category: "Unknown", recurrence: "daily", amount: -1 }])[0].amount, 0);

const expenseSeed = [
  {
    id: "fuel-june",
    date: "2026-06-10",
    category: "Fuel",
    amount: 30,
    notes: "Route",
    recurrence: "one_time",
    createdAt: "2026-06-10T10:00:00.000Z",
    updatedAt: "2026-06-10T10:00:00.000Z",
  },
  {
    id: "parking-may",
    date: "2026-05-15",
    category: "Parking",
    amount: 12,
    notes: "",
    recurrence: "weekly",
    createdAt: "2026-05-15T10:00:00.000Z",
    updatedAt: "2026-05-15T10:00:00.000Z",
  },
  {
    id: "insurance-old",
    date: "2026-03-30",
    category: "Insurance",
    amount: 200,
    notes: "",
    recurrence: "yearly",
    createdAt: "2026-03-30T10:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z",
  },
];

const afterAdd = addExpense(expenseSeed, {
  amount: "18.5",
  category: "Oils / Lotions",
  date: "2026-06-20",
  id: "oils-june",
  notes: "Restock",
  recurrence: "monthly",
}, { now: "2026-06-20T09:00:00.000Z" });

assert.equal(afterAdd.length, 4);
assert.equal(afterAdd[0].id, "oils-june", "newer expenses should sort latest first");
assert.equal(afterAdd[0].amount, 18.5);

const afterEdit = updateExpense(afterAdd, "oils-june", {
  amount: "22",
  notes: "Restock and towels",
}, { now: "2026-06-20T10:00:00.000Z" });

assert.equal(afterEdit.find((item) => item.id === "oils-june").amount, 22);
assert.equal(afterEdit.find((item) => item.id === "oils-june").notes, "Restock and towels");
assert.equal(afterEdit.find((item) => item.id === "oils-june").updatedAt, "2026-06-20T10:00:00.000Z");

const afterDelete = deleteExpense(afterEdit, "parking-may");
assert.equal(afterDelete.length, 3);
assert.equal(afterDelete.some((item) => item.id === "parking-may"), false);

assert.deepEqual(getCurrentTaxYearRange(DEFAULT_FINANCIAL_SETTINGS, "2026-06-20"), {
  start: "2026-04-06",
  end: "2027-04-05",
});

assert.equal(
  filterExpenses(afterEdit, { category: "Fuel", period: "all", todayValue: "2026-06-20" }).length,
  1,
  "category filter should narrow expenses",
);

const summary = buildExpenseSummary(afterEdit, DEFAULT_FINANCIAL_SETTINGS, "2026-06-20");
assert.equal(summary.expensesThisMonth, 52);
assert.equal(summary.expensesThisTaxYear, 64);
assert.deepEqual(summary.biggestCategoryThisTaxYear, { amount: 30, category: "Fuel" });

const revenueBookings = [
  { id: "bank-june", dateValue: "2026-06-12", paymentMethod: "bank_transfer", revenue: 120, status: "confirmed" },
  { id: "cash-june", dateValue: "2026-06-14", paymentMethod: "cash", revenue: 80, status: "confirmed" },
  { id: "old-tax-year", dateValue: "2026-03-30", paymentMethod: "bank_transfer", revenue: 500, status: "confirmed" },
  { id: "cancelled", dateValue: "2026-06-18", paymentMethod: "bank_transfer", revenue: 999, status: "cancelled" },
];

const financialOverview = buildFinancialOverview({
  bookings: revenueBookings,
  expenses: afterEdit,
  settings: DEFAULT_FINANCIAL_SETTINGS,
  todayValue: "2026-06-20",
});

assert.equal(financialOverview.revenueThisMonth, 200);
assert.equal(financialOverview.revenueThisTaxYear, 200);
assert.equal(financialOverview.expensesThisMonth, 52);
assert.equal(financialOverview.expensesThisTaxYear, 64);
assert.equal(financialOverview.profitThisMonth, 148);
assert.equal(financialOverview.profitThisTaxYear, 136);

assert.deepEqual(calculateGoalProgress(50, 200), {
  achieved: 50,
  hasGoal: true,
  percentage: 25,
  target: 200,
});
assert.equal(calculateGoalProgress(50, 0).hasGoal, false);

const goalProgress = buildGoalProgress(financialOverview, {
  ...DEFAULT_FINANCIAL_SETTINGS,
  annualProfitGoal: 1000,
  annualRevenueGoal: 400,
  monthlyProfitGoal: 296,
  monthlyRevenueGoal: 200,
});
assert.equal(goalProgress.find((goal) => goal.id === "monthlyRevenueGoal").percentage, 100);
assert.equal(goalProgress.find((goal) => goal.id === "annualRevenueGoal").percentage, 50);
assert.equal(goalProgress.some((goal) => goal.id === "monthlyProfitGoal"), false);
assert.equal(goalProgress.some((goal) => goal.id === "annualProfitGoal"), false);

const includeCashForecast = buildTaxForecast({
  bookings: revenueBookings,
  expenses: afterEdit,
  settings: { ...DEFAULT_FINANCIAL_SETTINGS, includeCashInTaxForecast: true, taxPotSavedAmount: 50 },
  todayValue: "2026-06-20",
});
assert.equal(includeCashForecast.revenueIncluded, 200);
assert.equal(includeCashForecast.excludedCashRevenue, 0);
assert.equal(includeCashForecast.expenses, 64);
assert.equal(includeCashForecast.estimatedProfit, 136);
assert.equal(includeCashForecast.deadline.date, "2028-01-31");

const excludeCashForecast = buildTaxForecast({
  bookings: revenueBookings,
  expenses: afterEdit,
  settings: { ...DEFAULT_FINANCIAL_SETTINGS, includeCashInTaxForecast: false },
  todayValue: "2026-06-20",
});
assert.equal(excludeCashForecast.revenueIncluded, 120);
assert.equal(excludeCashForecast.excludedCashRevenue, 80);
assert.equal(excludeCashForecast.estimatedProfit, 56);

const businessTarget = buildBusinessTarget({
  forecastPlanner: {
    requiredBookingsPerWeek: 3.25,
    requiredTreatmentHoursPerWeek: 4.5,
    scenarios: [{ id: "current", projectedRevenue: 500 }],
    workloadWarning: true,
  },
  overview: financialOverview,
  settings: {
    ...DEFAULT_FINANCIAL_SETTINGS,
    annualProfitGoal: 999999,
    annualRevenueGoal: 400,
    monthlyProfitGoal: 999,
  },
  taxForecast: includeCashForecast,
});

assert.equal(businessTarget.hasTarget, true);
assert.equal(businessTarget.annualRevenueTarget, 400);
assert.equal(businessTarget.progress.percentage, 50);
assert.equal(businessTarget.estimatedProfit, 136);
assert.equal(businessTarget.estimatedTaxAndNi, 0);
assert.equal(businessTarget.estimatedTakeHome, 136);
assert.equal(businessTarget.projectedTaxYearRevenue, 500);
assert.equal(businessTarget.requiredBookingsPerWeek, 3.25);
assert.equal(businessTarget.workloadWarning, true);

const emptyBusinessTarget = buildBusinessTarget({
  overview: financialOverview,
  settings: { ...DEFAULT_FINANCIAL_SETTINGS, annualProfitGoal: 12345 },
  taxForecast: includeCashForecast,
});

assert.equal(emptyBusinessTarget.hasTarget, false);
assert.equal(emptyBusinessTarget.progress.hasGoal, false);

const taxEstimate = estimateUkSelfEmployedTax(60000);
assert.equal(taxEstimate.estimatedIncomeTax, 11432);
assert.equal(taxEstimate.estimatedNationalInsurance, 2456.6);
assert.equal(taxEstimate.estimatedTotalTaxAndNi, 13888.6);

const forecastSettings = {
  ...DEFAULT_FINANCIAL_SETTINGS,
  annualRevenueGoal: 1000,
  preferredMaxSessionsPerWeek: 1,
};
const forecastDays = [
  {
    dateValue: "2026-06-20",
    settings: { workingStart: "09:00", workingEnd: "17:00" },
    bookings: [],
  },
  {
    dateValue: "2026-06-21",
    settings: { workingStart: "09:00", workingEnd: "17:00" },
    blocked: true,
    bookings: [],
  },
  {
    dateValue: "2026-06-22",
    settings: { workingStart: "09:00", workingEnd: "17:00" },
    bookings: [{ serviceId: "personal-event", kind: "personal", start: 540, duration: 480 }],
  },
  {
    dateValue: "2026-06-23",
    settings: { workingStart: "09:00", workingEnd: "17:00" },
    bookings: [],
  },
  {
    dateValue: "2026-06-24",
    settings: { workingStart: "09:00", workingEnd: "09:00" },
    bookings: [],
  },
];

assert.equal(countRemainingTaxYearDays(forecastSettings, "2027-04-03"), 3);
assert.equal(countRemainingWorkingDays(forecastDays, forecastSettings, "2027-04-03"), 1);

assert.deepEqual(
  getAverageBookingMetrics([], [
    { price: 100, duration: 60 },
    { price: 140, duration: 90 },
  ]),
  {
    averageBookingValue: 120,
    averageTreatmentDuration: 75,
    bookingCount: 0,
    usesFallback: true,
  },
);

const forecast = buildForecastPlanner({
  bookings: [
    { id: "hist-1", dateValue: "2026-04-10", paymentMethod: "bank_transfer", revenue: 100, duration: 60, status: "confirmed" },
    { id: "hist-2", dateValue: "2026-05-10", paymentMethod: "bank_transfer", revenue: 100, duration: 60, status: "confirmed" },
  ],
  days: forecastDays,
  serviceDefaults: [
    { price: 100, duration: 60 },
  ],
  settings: forecastSettings,
  todayValue: "2027-04-03",
});

assert.equal(forecast.currentRevenue, 200);
assert.equal(forecast.remainingRevenueNeeded, 800);
assert.equal(forecast.remainingTaxYearDays, 3);
assert.equal(forecast.remainingWorkingDays, 1);
assert.equal(forecast.remainingWorkingWeeks, 0.2);
assert.equal(forecast.requiredRevenuePerWorkingWeek, 4000);
assert.equal(forecast.requiredBookingsPerWeek, 40);
assert.equal(forecast.requiredTreatmentHoursPerWeek, 40);
assert.equal(forecast.workloadWarning, true);
assert.equal(forecast.usesFallbackPricing, true);
assert.equal(forecast.scenarios.find((scenario) => scenario.id === "plus_2").projectedRevenue > forecast.scenarios.find((scenario) => scenario.id === "current").projectedRevenue, true);

const malformedDataForecast = buildForecastPlanner({
  bookings: [null, "bad booking", { dateValue: "2026-06-20", revenue: 100, status: "confirmed" }],
  days: [null, "bad day", { dateValue: "2026-06-20", settings: { workingStart: "09:00", workingEnd: "17:00" }, bookings: [null] }],
  serviceDefaults: [null, { price: 120, duration: 60 }],
  settings: null,
  todayValue: "2026-06-20",
});

assert.equal(malformedDataForecast.currentRevenue, 100);
assert.equal(Number.isFinite(malformedDataForecast.remainingWorkingDays), true);

const malformedOverview = buildFinancialOverview({
  bookings: "not an array",
  expenses: "not an array",
  settings: null,
  todayValue: "2026-06-20",
});

assert.equal(malformedOverview.revenueThisMonth, 0);
assert.equal(malformedOverview.expensesThisMonth, 0);

console.log("Financial analytics tests passed.");
