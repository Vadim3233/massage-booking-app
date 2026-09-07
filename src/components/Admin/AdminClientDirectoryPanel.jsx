import React from "react";
import { CalendarDays, Star, UserRound } from "lucide-react";
import { customerInitials } from "../../lib/customerDisplay.js";

export function AdminClientDirectoryPanel({
  customerFilter,
  customerSearch,
  customerStats,
  customers,
  onChangeFilter,
  onChangeSearch,
  onOpenCustomer,
}) {
  return (
    <>
      <div className="clients-search-row">
        <input
          className="admin-search clients-search"
          type="search"
          placeholder="Search clients..."
          value={customerSearch}
          onChange={(event) => onChangeSearch(event.target.value)}
        />
        <div className="clients-filter-chips" aria-label="Client filters">
          <button
            type="button"
            className={customerFilter === "all" ? "active" : ""}
            onClick={() => onChangeFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={customerFilter === "returning" ? "active" : ""}
            onClick={() => onChangeFilter("returning")}
          >
            Returning
          </button>
        </div>
      </div>

      <div className="clients-stats-grid" aria-label="Client summary">
        <article>
          <UserRound aria-hidden="true" size={22} strokeWidth={2} />
          <span>Total Clients</span>
          <strong>{customerStats.total}</strong>
        </article>
        <article>
          <CalendarDays aria-hidden="true" size={22} strokeWidth={2} />
          <span>This Month</span>
          <strong>{customerStats.thisMonthBookings} bookings</strong>
        </article>
        <article>
          <Star aria-hidden="true" size={22} strokeWidth={2} />
          <span>Returning</span>
          <strong>{customerStats.returningRate}%</strong>
        </article>
      </div>

      <div className="clients-card-list">
        {customers.length === 0 && (
          <div className="clients-empty-state">
            <strong>No clients found.</strong>
            <p>Try another search or clear the returning filter.</p>
          </div>
        )}
        {customers.map((customer) => (
            <button
              type="button"
              className="customer-row client-list-card"
              key={customer.id}
              onClick={() => onOpenCustomer(customer)}
            >
              <span className="client-avatar" aria-hidden="true">
                {customer.avatarUrl ? <img src={customer.avatarUrl} alt="" /> : customerInitials(customer.name)}
              </span>
              <span className="client-list-main">
                <strong>{customer.name}</strong>
              </span>
            </button>
        ))}
      </div>
    </>
  );
}
