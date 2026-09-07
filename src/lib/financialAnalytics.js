export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Parking",
  "Congestion Charge / ULEZ",
  "Oils / Lotions",
  "Equipment",
  "Insurance",
  "Other",
];

export const EXPENSE_RECURRENCES = ["one_time", "weekly", "monthly", "yearly"];

export const EXPENSE_RECURRENCE_LABELS = {
  one_time: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const DEFAULT_FINANCIAL_SETTINGS = {
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
};

const FINANCIAL_SETTING_KEYS = Object.keys(DEFAULT_FINANCIAL_SETTINGS);

export const UK_SELF_EMPLOYED_TAX_ESTIMATE = {
  additionalRate: 0.45,
  additionalRateThreshold: 125140,
  basicRate: 0.2,
  basicRateUpperLimit: 50270,
  class4AdditionalRate: 0.02,
  class4LowerProfitLimit: 12570,
  class4MainRate: 0.06,
  class4UpperProfitLimit: 50270,
  higherRate: 0.4,
  personalAllowance: 12570,
  personalAllowanceTaperStart: 100000,
};

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeMoneyLike(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number * 100) / 100);
}

export function normalizeFinancialSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const next = { ...DEFAULT_FINANCIAL_SETTINGS };

  next.taxYearStartMonth = clampInteger(source.taxYearStartMonth, next.taxYearStartMonth, 1, 12);
  next.taxYearStartDay = clampInteger(source.taxYearStartDay, next.taxYearStartDay, 1, 31);
  next.taxYearEndMonth = clampInteger(source.taxYearEndMonth, next.taxYearEndMonth, 1, 12);
  next.taxYearEndDay = clampInteger(source.taxYearEndDay, next.taxYearEndDay, 1, 31);
  next.taxReturnDeadlineMonth = clampInteger(source.taxReturnDeadlineMonth, next.taxReturnDeadlineMonth, 1, 12);
  next.taxReturnDeadlineDay = clampInteger(source.taxReturnDeadlineDay, next.taxReturnDeadlineDay, 1, 31);
  next.includeCashInTaxForecast = source.includeCashInTaxForecast !== false;
  next.monthlyRevenueGoal = normalizeMoneyLike(source.monthlyRevenueGoal);
  next.annualRevenueGoal = normalizeMoneyLike(source.annualRevenueGoal);
  next.monthlyProfitGoal = normalizeMoneyLike(source.monthlyProfitGoal);
  next.annualProfitGoal = normalizeMoneyLike(source.annualProfitGoal);
  next.preferredMaxSessionsPerWeek = clampInteger(source.preferredMaxSessionsPerWeek, next.preferredMaxSessionsPerWeek, 0, 99);
  next.taxPotSavedAmount = normalizeMoneyLike(source.taxPotSavedAmount);

  return next;
}

export function updateFinancialSettings(currentSettings, patch) {
  return normalizeFinancialSettings({
    ...normalizeFinancialSettings(currentSettings),
    ...(patch && typeof patch === "object" ? patch : {}),
  });
}

export function normalizeExpense(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const now = new Date().toISOString();
  const category = EXPENSE_CATEGORIES.includes(source.category) ? source.category : "Other";
  const recurrence = EXPENSE_RECURRENCES.includes(source.recurrence) ? source.recurrence : "one_time";
  const randomId = globalThis.crypto?.randomUUID?.();

  return {
    id: String(source.id || randomId || `expense-${Date.now()}`),
    date: String(source.date || now.slice(0, 10)),
    category,
    amount: normalizeMoneyLike(source.amount),
    notes: source.notes ? String(source.notes) : "",
    recurrence,
    createdAt: String(source.createdAt || now),
    updatedAt: String(source.updatedAt || source.createdAt || now),
  };
}

export function sanitizeExpenses(input = []) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeExpense);
}

export function hasOnlyFinancialSettingKeys(input = {}) {
  return Object.keys(input).every((key) => FINANCIAL_SETTING_KEYS.includes(key));
}

function dateFromValue(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValueFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateValueFromDate(date) {
  return dateValueFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetweenValues(startValue, endValue) {
  const start = dateFromValue(startValue);
  const end = dateFromValue(endValue);
  if (!start || !end) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function timeValueToMinutes(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getCurrentMonthRange(todayValue = new Date().toISOString().slice(0, 10)) {
  const today = dateFromValue(todayValue) || new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const end = new Date(year, month, 0).getDate();

  return {
    end: dateValueFromParts(year, month, end),
    start: dateValueFromParts(year, month, 1),
  };
}

export function getCurrentTaxYearRange(settings = DEFAULT_FINANCIAL_SETTINGS, todayValue = new Date().toISOString().slice(0, 10)) {
  const financialSettings = normalizeFinancialSettings(settings);
  const today = dateFromValue(todayValue) || new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const startMonth = financialSettings.taxYearStartMonth;
  const startDay = financialSettings.taxYearStartDay;
  const startYear = todayMonth > startMonth || (todayMonth === startMonth && todayDay >= startDay)
    ? today.getFullYear()
    : today.getFullYear() - 1;

  return {
    end: dateValueFromParts(startYear + 1, financialSettings.taxYearEndMonth, financialSettings.taxYearEndDay),
    start: dateValueFromParts(startYear, startMonth, startDay),
  };
}

export function isExpenseInsideRange(expense, range) {
  if (!expense?.date || !range?.start || !range?.end) return false;
  return expense.date >= range.start && expense.date <= range.end;
}

export function sortExpensesLatestFirst(expenses = []) {
  return sanitizeExpenses(expenses).sort((first, second) => {
    if (first.date !== second.date) return second.date.localeCompare(first.date);
    return second.createdAt.localeCompare(first.createdAt);
  });
}

export function filterExpenses(expenses = [], { category = "all", period = "all", settings = DEFAULT_FINANCIAL_SETTINGS, todayValue } = {}) {
  const sorted = sortExpensesLatestFirst(expenses);
  const categoryFiltered = category === "all" ? sorted : sorted.filter((expense) => expense.category === category);
  if (period === "current_month") {
    const range = getCurrentMonthRange(todayValue);
    return categoryFiltered.filter((expense) => isExpenseInsideRange(expense, range));
  }
  if (period === "current_tax_year") {
    const range = getCurrentTaxYearRange(settings, todayValue);
    return categoryFiltered.filter((expense) => isExpenseInsideRange(expense, range));
  }
  return categoryFiltered;
}

export function sumExpenseAmounts(expenses = []) {
  return sanitizeExpenses(expenses).reduce((total, expense) => total + expense.amount, 0);
}

export function getBiggestExpenseCategory(expenses = []) {
  const totals = new Map();
  sanitizeExpenses(expenses).forEach((expense) => {
    totals.set(expense.category, (totals.get(expense.category) || 0) + expense.amount);
  });
  return [...totals.entries()]
    .map(([category, amount]) => ({ amount: Math.round(amount * 100) / 100, category }))
    .sort((first, second) => second.amount - first.amount)[0] ?? null;
}

export function buildExpenseSummary(expenses = [], settings = DEFAULT_FINANCIAL_SETTINGS, todayValue) {
  const monthExpenses = filterExpenses(expenses, { period: "current_month", settings, todayValue });
  const taxYearExpenses = filterExpenses(expenses, { period: "current_tax_year", settings, todayValue });
  return {
    biggestCategoryThisTaxYear: getBiggestExpenseCategory(taxYearExpenses),
    expensesThisMonth: Math.round(sumExpenseAmounts(monthExpenses) * 100) / 100,
    expensesThisTaxYear: Math.round(sumExpenseAmounts(taxYearExpenses) * 100) / 100,
  };
}

export function addExpense(expenses = [], expenseInput = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const id = options.id || expenseInput.id;
  return sortExpensesLatestFirst([
    ...sanitizeExpenses(expenses),
    normalizeExpense({
      ...expenseInput,
      createdAt: expenseInput.createdAt || now,
      id,
      updatedAt: expenseInput.updatedAt || now,
    }),
  ]);
}

export function updateExpense(expenses = [], expenseId, patch = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  return sortExpensesLatestFirst(
    sanitizeExpenses(expenses).map((expense) =>
      expense.id === expenseId
        ? normalizeExpense({ ...expense, ...patch, id: expense.id, createdAt: expense.createdAt, updatedAt: now })
        : expense
    )
  );
}

export function deleteExpense(expenses = [], expenseId) {
  return sortExpensesLatestFirst(sanitizeExpenses(expenses).filter((expense) => expense.id !== expenseId));
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function valueInRange(dateValue, range) {
  if (!dateValue || !range?.start || !range?.end) return false;
  return dateValue >= range.start && dateValue <= range.end;
}

function bookingAmount(booking = {}) {
  const source = booking && typeof booking === "object" ? booking : {};
  for (const key of ["revenue", "total", "totalDue", "price"]) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  if (Array.isArray(source.items)) {
    const itemTotal = source.items.reduce((total, item) => total + (Number(item?.price) || 0), 0);
    if (itemTotal > 0) return itemTotal;
  }
  return 0;
}

function bookingDate(booking = {}) {
  const source = booking && typeof booking === "object" ? booking : {};
  return source.dateValue || source.date || "";
}

function bookingStatusValue(booking = {}) {
  const source = booking && typeof booking === "object" ? booking : {};
  return String(source.status || source.bookingStatus || "").toLowerCase();
}

function paymentStatusValue(booking = {}) {
  const source = booking && typeof booking === "object" ? booking : {};
  return String(source.paymentStatus || "").toLowerCase();
}

function bookingPaymentMethod(booking = {}) {
  const source = booking && typeof booking === "object" ? booking : {};
  return String(source.paymentMethod || "").toLowerCase();
}

function isCancelledRevenueBooking(booking = {}) {
  const status = bookingStatusValue(booking);
  const paymentStatus = paymentStatusValue(booking);
  return ["cancelled", "refunded", "no-show", "no_show"].includes(status) || paymentStatus === "refunded";
}

export function isCashRevenueBooking(booking = {}) {
  const method = bookingPaymentMethod(booking);
  const paymentStatus = paymentStatusValue(booking);
  return method === "cash" || method === "cash_on_arrival" || paymentStatus === "cash_on_arrival";
}

export function sumRevenueInRange(bookings = [], range, { includeCash = true } = {}) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  return roundMoney(safeBookings.reduce((total, booking) => {
    if (isCancelledRevenueBooking(booking)) return total;
    if (!valueInRange(bookingDate(booking), range)) return total;
    if (!includeCash && isCashRevenueBooking(booking)) return total;
    return total + bookingAmount(booking);
  }, 0));
}

export function sumExcludedCashRevenueInRange(bookings = [], range) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  return roundMoney(safeBookings.reduce((total, booking) => {
    if (isCancelledRevenueBooking(booking)) return total;
    if (!valueInRange(bookingDate(booking), range)) return total;
    if (!isCashRevenueBooking(booking)) return total;
    return total + bookingAmount(booking);
  }, 0));
}

export function buildFinancialOverview({ bookings = [], expenses = [], settings = DEFAULT_FINANCIAL_SETTINGS, todayValue } = {}) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const financialSettings = normalizeFinancialSettings(settings);
  const monthRange = getCurrentMonthRange(todayValue);
  const taxYearRange = getCurrentTaxYearRange(financialSettings, todayValue);
  const monthRevenue = sumRevenueInRange(safeBookings, monthRange, { includeCash: true });
  const taxYearRevenue = sumRevenueInRange(safeBookings, taxYearRange, { includeCash: true });
  const monthExpenses = sumExpenseAmounts(filterExpenses(expenses, { period: "current_month", settings: financialSettings, todayValue }));
  const taxYearExpenses = sumExpenseAmounts(filterExpenses(expenses, { period: "current_tax_year", settings: financialSettings, todayValue }));

  return {
    expensesThisMonth: roundMoney(monthExpenses),
    expensesThisTaxYear: roundMoney(taxYearExpenses),
    profitThisMonth: roundMoney(monthRevenue - monthExpenses),
    profitThisTaxYear: roundMoney(taxYearRevenue - taxYearExpenses),
    revenueThisMonth: monthRevenue,
    revenueThisTaxYear: taxYearRevenue,
  };
}

export function calculateGoalProgress(achieved, target) {
  const achievedAmount = roundMoney(achieved);
  const targetAmount = roundMoney(target);
  const percentage = targetAmount > 0 ? Math.min(999, Math.round((achievedAmount / targetAmount) * 100)) : 0;
  return {
    achieved: achievedAmount,
    hasGoal: targetAmount > 0,
    percentage,
    target: targetAmount,
  };
}

export function buildGoalProgress(overview, settings = DEFAULT_FINANCIAL_SETTINGS) {
  const financialSettings = normalizeFinancialSettings(settings);
  return [
    {
      id: "monthlyRevenueGoal",
      label: "Monthly revenue target",
      ...calculateGoalProgress(overview.revenueThisMonth, financialSettings.monthlyRevenueGoal),
    },
    {
      id: "annualRevenueGoal",
      label: "Annual Revenue Target",
      ...calculateGoalProgress(overview.revenueThisTaxYear, financialSettings.annualRevenueGoal),
    },
  ];
}

export function buildBusinessTarget({
  forecastPlanner = {},
  overview = {},
  settings = DEFAULT_FINANCIAL_SETTINGS,
  taxForecast = {},
} = {}) {
  const financialSettings = normalizeFinancialSettings(settings);
  const annualRevenueTarget = financialSettings.annualRevenueGoal;
  const currentTaxYearRevenue = roundMoney(overview.revenueThisTaxYear);
  const progress = calculateGoalProgress(currentTaxYearRevenue, annualRevenueTarget);
  const estimatedExpenses = roundMoney(taxForecast.expenses ?? overview.expensesThisTaxYear);
  const estimatedProfit = roundMoney(taxForecast.estimatedProfit ?? (currentTaxYearRevenue - estimatedExpenses));
  const taxEstimate = taxForecast.taxEstimate || estimateUkSelfEmployedTax(estimatedProfit);
  const estimatedTaxAndNi = roundMoney(taxEstimate.estimatedTotalTaxAndNi);
  const estimatedTakeHome = roundMoney(Math.max(0, estimatedProfit - estimatedTaxAndNi));
  const currentScenario = Array.isArray(forecastPlanner.scenarios)
    ? forecastPlanner.scenarios.find((scenario) => scenario.id === "current")
    : null;
  const projectedTaxYearRevenue = roundMoney(Math.max(
    currentTaxYearRevenue,
    Number(currentScenario?.projectedRevenue) || 0
  ));

  return {
    annualRevenueTarget,
    currentTaxYearRevenue,
    estimatedExpenses,
    estimatedProfit,
    estimatedTakeHome,
    estimatedTaxAndNi,
    hasTarget: annualRevenueTarget > 0,
    progress,
    projectedTaxYearRevenue,
    requiredBookingsPerWeek: roundMoney(forecastPlanner.requiredBookingsPerWeek),
    requiredTreatmentHoursPerWeek: roundMoney(forecastPlanner.requiredTreatmentHoursPerWeek),
    workloadWarning: Boolean(forecastPlanner.workloadWarning),
  };
}

export function estimateUkSelfEmployedTax(profit, constants = UK_SELF_EMPLOYED_TAX_ESTIMATE) {
  const taxableProfit = Math.max(0, Number(profit) || 0);
  const allowanceReduction = Math.max(0, Math.floor((taxableProfit - constants.personalAllowanceTaperStart) / 2));
  const personalAllowance = Math.max(0, constants.personalAllowance - allowanceReduction);
  const taxableIncome = Math.max(0, taxableProfit - personalAllowance);
  const basicBandWidth = Math.max(0, constants.basicRateUpperLimit - constants.personalAllowance);
  const higherBandWidth = Math.max(0, constants.additionalRateThreshold - constants.basicRateUpperLimit);
  const basicTax = Math.min(taxableIncome, basicBandWidth) * constants.basicRate;
  const higherTax = Math.min(Math.max(0, taxableIncome - basicBandWidth), higherBandWidth) * constants.higherRate;
  const additionalTax = Math.max(0, taxableIncome - basicBandWidth - higherBandWidth) * constants.additionalRate;
  const mainClass4 = Math.min(
    Math.max(0, taxableProfit - constants.class4LowerProfitLimit),
    Math.max(0, constants.class4UpperProfitLimit - constants.class4LowerProfitLimit)
  ) * constants.class4MainRate;
  const additionalClass4 = Math.max(0, taxableProfit - constants.class4UpperProfitLimit) * constants.class4AdditionalRate;
  const incomeTax = roundMoney(basicTax + higherTax + additionalTax);
  const nationalInsurance = roundMoney(mainClass4 + additionalClass4);

  return {
    estimatedIncomeTax: incomeTax,
    estimatedNationalInsurance: nationalInsurance,
    estimatedTotalTaxAndNi: roundMoney(incomeTax + nationalInsurance),
    personalAllowance: roundMoney(personalAllowance),
    taxableIncome: roundMoney(taxableIncome),
  };
}

export function getSelfAssessmentDeadline(settings = DEFAULT_FINANCIAL_SETTINGS, todayValue) {
  const financialSettings = normalizeFinancialSettings(settings);
  const taxYearRange = getCurrentTaxYearRange(financialSettings, todayValue);
  const endYear = Number(taxYearRange.end.slice(0, 4));
  const endMonth = Number(taxYearRange.end.slice(5, 7));
  const deadlineYear = financialSettings.taxReturnDeadlineMonth <= endMonth ? endYear + 1 : endYear;
  const deadline = dateValueFromParts(deadlineYear, financialSettings.taxReturnDeadlineMonth, financialSettings.taxReturnDeadlineDay);
  const today = dateFromValue(todayValue || new Date().toISOString().slice(0, 10)) || new Date();
  const deadlineDate = dateFromValue(deadline);
  const daysRemaining = deadlineDate ? Math.max(0, Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000)) : 0;

  return {
    date: deadline,
    daysRemaining,
  };
}

export function buildTaxForecast({ bookings = [], expenses = [], settings = DEFAULT_FINANCIAL_SETTINGS, todayValue } = {}) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const financialSettings = normalizeFinancialSettings(settings);
  const taxYearRange = getCurrentTaxYearRange(financialSettings, todayValue);
  const includedRevenue = sumRevenueInRange(safeBookings, taxYearRange, { includeCash: financialSettings.includeCashInTaxForecast });
  const excludedCashRevenue = financialSettings.includeCashInTaxForecast ? 0 : sumExcludedCashRevenueInRange(safeBookings, taxYearRange);
  const expenseTotal = roundMoney(sumExpenseAmounts(filterExpenses(expenses, { period: "current_tax_year", settings: financialSettings, todayValue })));
  const estimatedProfit = roundMoney(includedRevenue - expenseTotal);
  const taxEstimate = estimateUkSelfEmployedTax(estimatedProfit);
  const taxPotTarget = taxEstimate.estimatedTotalTaxAndNi;
  const taxPotSaved = financialSettings.taxPotSavedAmount;

  return {
    deadline: getSelfAssessmentDeadline(financialSettings, todayValue),
    estimatedProfit,
    excludedCashRevenue,
    expenses: expenseTotal,
    revenueIncluded: includedRevenue,
    taxEstimate,
    taxPotProgress: calculateGoalProgress(taxPotSaved, taxPotTarget),
    taxPotSavedAmount: taxPotSaved,
    taxYearRange,
  };
}

function isPersonalUnavailableBooking(booking = {}, workingStart = 0, workingEnd = 1440) {
  const source = booking && typeof booking === "object" ? booking : {};
  const isPersonal = source.kind === "personal" || source.type === "personal" || source.serviceId === "personal-event";
  if (!isPersonal) return false;
  if (source.unavailable === true || source.available === false) return true;
  const start = Number.isFinite(Number(source.start)) ? Number(source.start) : timeValueToMinutes(source.start);
  const duration = Number(source.duration) || 0;
  if (!Number.isFinite(start) || duration <= 0) return false;
  return start <= workingStart && start + duration >= workingEnd;
}

function dayIsUnavailable(day = {}) {
  const source = day && typeof day === "object" ? day : {};
  return Boolean(
    source.holiday ||
    source.isHoliday ||
    source.blocked ||
    source.isBlocked ||
    source.unavailable ||
    source.isUnavailable ||
    source.available === false
  );
}

function workingMinutesForDay(day = {}) {
  const source = day && typeof day === "object" ? day : {};
  const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
  if (dayIsUnavailable(source) || settings.closed || settings.unavailable || settings.available === false) return 0;
  const workingStart = timeValueToMinutes(settings.workingStart);
  const workingEnd = timeValueToMinutes(settings.workingEnd);
  if (!Number.isFinite(workingStart) || !Number.isFinite(workingEnd) || workingEnd <= workingStart) return 0;
  const personalBlocks = Array.isArray(source.bookings)
    ? source.bookings.filter((booking) => isPersonalUnavailableBooking(booking, workingStart, workingEnd))
    : [];
  return personalBlocks.length > 0 ? 0 : workingEnd - workingStart;
}

function dayPatternKey(dateValue) {
  const date = dateFromValue(dateValue);
  return date ? String(date.getDay()) : "";
}

function findForecastDayTemplate(days = [], dateValue) {
  const safeDays = Array.isArray(days) ? days.filter((day) => day && typeof day === "object") : [];
  const exact = safeDays.find((day) => day.dateValue === dateValue);
  if (exact) return exact;
  const key = dayPatternKey(dateValue);
  return safeDays.find((day) => dayPatternKey(day.dateValue) === key) || null;
}

export function countRemainingTaxYearDays(settings = DEFAULT_FINANCIAL_SETTINGS, todayValue) {
  const range = getCurrentTaxYearRange(settings, todayValue);
  const today = todayValue || new Date().toISOString().slice(0, 10);
  const start = today > range.start ? today : range.start;
  if (start > range.end) return 0;
  return daysBetweenValues(start, range.end) + 1;
}

export function countRemainingWorkingDays(days = [], settings = DEFAULT_FINANCIAL_SETTINGS, todayValue) {
  const range = getCurrentTaxYearRange(settings, todayValue);
  const today = todayValue || new Date().toISOString().slice(0, 10);
  const startValue = today > range.start ? today : range.start;
  const startDate = dateFromValue(startValue);
  const endDate = dateFromValue(range.end);
  if (!startDate || !endDate || startDate > endDate) return 0;

  let count = 0;
  for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
    const dateValue = dateValueFromDate(date);
    const template = findForecastDayTemplate(days, dateValue);
    if (template && workingMinutesForDay(template) > 0) count += 1;
  }
  return count;
}

export function getAverageBookingMetrics(bookings = [], serviceDefaults = []) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const safeServiceDefaults = Array.isArray(serviceDefaults) ? serviceDefaults : [];
  const revenueBookings = safeBookings
    .filter((booking) => !isCancelledRevenueBooking(booking))
    .filter((booking) => bookingAmount(booking) > 0);
  const enoughHistory = revenueBookings.length >= 3;
  const defaultRows = safeServiceDefaults
    .map((service) => {
      const source = service && typeof service === "object" ? service : {};
      return {
        duration: Number(source.duration) || 0,
        price: Number(source.price) || 0,
      };
    })
    .filter((service) => service.duration > 0 && service.price > 0);

  if (enoughHistory) {
    return {
      averageBookingValue: roundMoney(revenueBookings.reduce((total, booking) => total + bookingAmount(booking), 0) / revenueBookings.length),
      averageTreatmentDuration: Math.round(revenueBookings.reduce((total, booking) => total + (Number(booking.duration) || 0), 0) / revenueBookings.length),
      bookingCount: revenueBookings.length,
      usesFallback: false,
    };
  }

  const fallbackPrice = defaultRows.length
    ? defaultRows.reduce((total, service) => total + service.price, 0) / defaultRows.length
    : 100;
  const fallbackDuration = defaultRows.length
    ? defaultRows.reduce((total, service) => total + service.duration, 0) / defaultRows.length
    : 60;

  return {
    averageBookingValue: roundMoney(fallbackPrice),
    averageTreatmentDuration: Math.round(fallbackDuration),
    bookingCount: revenueBookings.length,
    usesFallback: true,
  };
}

export function buildForecastPlanner({
  bookings = [],
  days = [],
  serviceDefaults = [],
  settings = DEFAULT_FINANCIAL_SETTINGS,
  todayValue,
} = {}) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const safeDays = Array.isArray(days) ? days : [];
  const safeServiceDefaults = Array.isArray(serviceDefaults) ? serviceDefaults : [];
  const financialSettings = normalizeFinancialSettings(settings);
  const taxYearRange = getCurrentTaxYearRange(financialSettings, todayValue);
  const currentRevenue = sumRevenueInRange(safeBookings, taxYearRange, { includeCash: true });
  const annualRevenueGoal = financialSettings.annualRevenueGoal;
  const remainingRevenueNeeded = roundMoney(Math.max(0, annualRevenueGoal - currentRevenue));
  const remainingTaxYearDays = countRemainingTaxYearDays(financialSettings, todayValue);
  const remainingWorkingDays = countRemainingWorkingDays(safeDays, financialSettings, todayValue);
  const remainingWorkingWeeks = roundMoney(remainingWorkingDays / 5);
  const averageMetrics = getAverageBookingMetrics(
    safeBookings.filter((booking) => valueInRange(bookingDate(booking), taxYearRange)),
    safeServiceDefaults
  );
  const requiredRevenuePerWorkingWeek = remainingWorkingWeeks > 0 ? roundMoney(remainingRevenueNeeded / remainingWorkingWeeks) : 0;
  const requiredBookingsPerWeek = averageMetrics.averageBookingValue > 0 && remainingWorkingWeeks > 0
    ? roundMoney(requiredRevenuePerWorkingWeek / averageMetrics.averageBookingValue)
    : 0;
  const requiredTreatmentHoursPerWeek = roundMoney(requiredBookingsPerWeek * averageMetrics.averageTreatmentDuration / 60);
  const elapsedDays = Math.max(1, daysBetweenValues(taxYearRange.start, todayValue || new Date().toISOString().slice(0, 10)) + 1);
  const elapsedWeeks = Math.max(1, elapsedDays / 7);
  const completedBookingsThisTaxYear = safeBookings
    .filter((booking) => !isCancelledRevenueBooking(booking))
    .filter((booking) => valueInRange(bookingDate(booking), taxYearRange))
    .length;
  const currentBookingsPerWeek = completedBookingsThisTaxYear / elapsedWeeks;
  const scenarios = [
    ["current", "Current pace", 0],
    ["plus_1", "+1 booking per week", 1],
    ["plus_2", "+2 bookings per week", 2],
    ["plus_3", "+3 bookings per week", 3],
  ].map(([id, label, extraBookings]) => {
    const bookingsPerWeek = currentBookingsPerWeek + extraBookings;
    const projectedRevenue = roundMoney(currentRevenue + bookingsPerWeek * remainingWorkingWeeks * averageMetrics.averageBookingValue);
    return {
      bookingsPerWeek: roundMoney(bookingsPerWeek),
      id,
      label,
      projectedRevenue,
      shortfall: roundMoney(Math.max(0, annualRevenueGoal - projectedRevenue)),
    };
  });
  const preferredMaxSessionsPerWeek = financialSettings.preferredMaxSessionsPerWeek;

  return {
    annualRevenueGoal,
    averageBookingValue: averageMetrics.averageBookingValue,
    averageTreatmentDuration: averageMetrics.averageTreatmentDuration,
    currentRevenue,
    remainingRevenueNeeded,
    remainingTaxYearDays,
    remainingWorkingDays,
    remainingWorkingWeeks,
    requiredBookingsPerWeek,
    requiredRevenuePerWorkingWeek,
    requiredTreatmentHoursPerWeek,
    scenarios,
    taxYearRange,
    usesFallbackPricing: averageMetrics.usesFallback,
    workloadWarning: preferredMaxSessionsPerWeek > 0 && requiredBookingsPerWeek > preferredMaxSessionsPerWeek,
  };
}
