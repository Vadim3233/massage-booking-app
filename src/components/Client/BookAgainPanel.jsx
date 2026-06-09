import React from "react";

function serviceNames(selection) {
  return selection?.services?.map((service) => service.name).filter(Boolean).join(" + ") || "";
}

function SessionDetails({ selection }) {
  return (
    <div className="book-again-details">
      <strong>{serviceNames(selection)}</strong>
      <span>{selection.totalDuration} minutes</span>
      {selection.area && <span>{selection.area}</span>}
    </div>
  );
}

export function BookAgainPanel({
  clientName = "",
  favoriteSelection = null,
  lastSelection = null,
  loading = false,
  onApply,
  recentSelections = [],
  usualSelection = null,
}) {
  if (loading) {
    return <p className="book-again-loading" role="status">Preparing your usual session...</p>;
  }
  if (!usualSelection) return null;

  return (
    <section className="book-again-panel" aria-label="Returning client shortcuts">
      <div className="book-again-welcome">
        <p className="boutique-kicker">Welcome back{clientName ? `, ${clientName.split(" ")[0]}` : ""}</p>
        <span>Your private treatment preferences are ready.</span>
      </div>
      <div className="book-again-primary">
        <div>
          <h2>Book your usual session</h2>
          <SessionDetails selection={usualSelection} />
        </div>
        <button type="button" onClick={() => onApply(usualSelection)}>Book Again</button>
      </div>
      <div className="returning-shortcut-grid" aria-label="Quick booking shortcuts">
        {lastSelection && (
          <button type="button" onClick={() => onApply(lastSelection)}>
            <span>Repeat last session</span>
            <small>{serviceNames(lastSelection)} · {lastSelection.totalDuration} min</small>
          </button>
        )}
        {favoriteSelection && favoriteSelection.key !== lastSelection?.key && (
          <button type="button" onClick={() => onApply(favoriteSelection)}>
            <span>Favourite session</span>
            <small>{serviceNames(favoriteSelection)} · {favoriteSelection.totalDuration} min</small>
          </button>
        )}
      </div>
      {recentSelections.length > 0 && (
        <div className="recent-treatment-list">
          <span>Recent treatments</span>
          <div>
            {recentSelections.map((selection, index) => (
              <button
                type="button"
                key={`${selection.key}-${index}`}
                onClick={() => onApply(selection)}
              >
                <strong>{serviceNames(selection)}</strong>
                <small>{selection.totalDuration} min{selection.area ? ` - ${selection.area}` : ""}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
