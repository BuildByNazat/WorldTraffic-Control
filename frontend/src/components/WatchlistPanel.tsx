import React from "react";
import type { WatchlistItem } from "../hooks/useWatchlist";

interface WatchlistPanelProps {
  isAuthenticated: boolean;
  userEmail: string | null;
  items: WatchlistItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  selectedAircraftId: string | null;
  onSelectItem: (item: WatchlistItem) => void;
  onRemoveItem: (aircraftId: string) => void;
}

function formatObservedAt(value: string | null): string {
  if (!value) return "Observation unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Observation unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
  isAuthenticated,
  userEmail,
  items,
  loading,
  saving,
  error,
  selectedAircraftId,
  onSelectItem,
  onRemoveItem,
}) => {
  return (
    <section className="watchlist-panel">
      <div className="watchlist-panel__header">
        <span className="watchlist-panel__title">Saved Aircraft</span>
        <span className="watchlist-panel__meta">
          {isAuthenticated ? userEmail : "Account required"}
        </span>
      </div>

      {!isAuthenticated && (
        <div className="watchlist-panel__state">
          Sign in to save aircraft and revisit them from your watchlist.
        </div>
      )}

      {isAuthenticated && loading && (
        <div className="watchlist-panel__state">Loading saved aircraft...</div>
      )}

      {isAuthenticated && !loading && error && (
        <div className="watchlist-panel__state watchlist-panel__state--error">
          {error}
        </div>
      )}

      {isAuthenticated && !loading && !error && items.length === 0 && (
        <div className="watchlist-panel__state">
          No aircraft saved yet. Select an aircraft on the map or in search, then save it from the detail drawer.
        </div>
      )}

      {isAuthenticated && items.length > 0 && (
        <div className="watchlist-panel__list">
          {items.map((item) => (
            <article
              key={item.aircraft_id}
              className={`watchlist-item${
                selectedAircraftId === item.aircraft_id ? " watchlist-item--selected" : ""
              }`}
            >
              <button
                type="button"
                className="watchlist-item__main"
                onClick={() => onSelectItem(item)}
              >
                <span className="watchlist-item__title">
                  {item.callsign ?? item.flight_identifier ?? item.aircraft_id}
                </span>
                <span className="watchlist-item__meta">
                  {item.aircraft_id} / {item.provider_name ?? item.source}
                </span>
                <span className="watchlist-item__meta">
                  Last seen {formatObservedAt(item.observed_at)}
                </span>
              </button>
              <button
                type="button"
                className="watchlist-item__remove"
                onClick={() => onRemoveItem(item.aircraft_id)}
                disabled={saving}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default WatchlistPanel;
