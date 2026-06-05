import React, { useMemo, useState } from "react";
import { getBookingBlocks, timeToMinutes } from "../../schedulingEngine.js";

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

function bookingRevenue(booking) {
  if (isPersonalEvent(booking)) return 0;
  if (isFiniteNumber(booking.total)) return Number(booking.total);
  if (isFiniteNumber(booking.price) && Number(booking.price) > 0) return Number(booking.price);
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

function daysBetween(firstDate, secondDate) {
  const milliseconds = bookingDateObject(secondDate)?.getTime() - bookingDateObject(firstDate)?.getTime();
  return Number.isFinite(milliseconds) ? Math.round(milliseconds / 86400000) : 0;
}

function flattenAnalyticsBookings(days) {
  return days.flatMap((day) =>
    getBookingBlocks(day.bookings)
      .filter((booking) => !isPersonalEvent(booking))
      .map((booking) => ({
        ...booking,
        area: booking.location || booking.selectedAreaName || booking.address || "Area not captured",
        dateValue: booking.dateValue || day.dateValue,
        dayLabel: day.label,
        revenue: bookingRevenue(booking),
        status: bookingStatus(booking),
      }))
  );
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

export function BusinessAnalyticsDashboard({ days, services, settings }) {
  const [range, setRange] = useState("6");
  const [areaSort, setAreaSort] = useState("revenue");
  const bookings = useMemo(() => flattenAnalyticsBookings(days), [days]);
  const today = useMemo(() => bookingDateObject(todayValue()) || new Date(), []);
  const lifetimeRevenue = sumRevenue(bookings);
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
  const serviceRows = groupedAnalyticsRows(bookings, (booking) => booking.serviceName || serviceNameFor(services, booking.serviceId));
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
  const workingStart = timeToMinutes(settings.workingStart);
  const workingEnd = timeToMinutes(settings.workingEnd);
  const availableHours = Math.max(0, (workingEnd - workingStart) / 60) * Math.max(1, days.length);
  const utilisation = availableHours ? Math.round((treatmentHours / availableHours) * 100) : 0;
  const utilisationStatus = utilisation >= 70 ? "green" : utilisation >= 50 ? "amber" : "red";
  const estimatedTax = Math.round(lifetimeRevenue * 0.2);
  const estimatedNi = Math.round(lifetimeRevenue * 0.06);
  const netIncome = lifetimeRevenue - estimatedTax - estimatedNi;
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

  return (
    <section className="admin-screen analytics-dashboard">
      <div className="admin-screen-heading analytics-hero-heading">
        <div>
          <p>Business Analytics</p>
          <h2>Financial Dashboard</h2>
          <span>Private-practice performance, revenue, retention, and working-rate insight.</span>
        </div>
        <div className="analytics-export-actions">
          <button type="button" onClick={exportCsv}>Export CSV</button>
          <button type="button" onClick={exportExcel}>Export Excel</button>
          <button type="button" onClick={exportPdfSummary}>Export PDF Summary</button>
        </div>
      </div>

      <div className="analytics-card-grid financial-card-grid">
        {revenueCards.map((card) => (
          <article className="analytics-metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{formatMoney(card.value)}</strong>
            <small className={card.change >= 0 ? "positive-trend" : "negative-trend"}>
              {card.change >= 0 ? "Up" : "Down"} {Math.abs(card.change)}% vs previous period
            </small>
          </article>
        ))}
      </div>

      <div className="analytics-two-column">
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

      <section className="analytics-panel">
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

      <div className="analytics-two-column">
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

      <div className="analytics-two-column">
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

      <div className="analytics-two-column">
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

        <section className="analytics-panel tax-panel">
          <div className="analytics-panel-heading">
            <div>
              <p>Tax Estimator</p>
              <h3>Self-employed reserve</h3>
            </div>
          </div>
          <dl className="tax-estimate-list">
            <div><dt>Gross Revenue</dt><dd>{formatMoney(lifetimeRevenue)}</dd></div>
            <div><dt>Estimated Tax Reserve</dt><dd>{formatMoney(estimatedTax)}</dd></div>
            <div><dt>Estimated National Insurance</dt><dd>{formatMoney(estimatedNi)}</dd></div>
            <div><dt>Estimated Net Income</dt><dd>{formatMoney(netIncome)}</dd></div>
          </dl>
          <p>Estimate only. Consult your accountant.</p>
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

