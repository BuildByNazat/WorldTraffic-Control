/**
 * App - root component.
 *
 * Manages two modes:
 *   live    - WebSocket feed drives the map, status panel visible
 *   history - history panel visible, clicking items highlights on map
 *
 * The live feed is always running in the background; switching to history
 * mode simply shows the panel and allows selecting historical points.
 */

import React, { useState } from "react";
import LiveMap from "./components/LiveMap";
import type { HighlightLocation } from "./components/LiveMap";
import StatusPanel from "./components/StatusPanel";
import ModeToggle from "./components/ModeToggle";
import type { AppMode } from "./components/ModeToggle";
import HistoryPanel from "./components/HistoryPanel";
import type { SelectedLocation } from "./components/HistoryPanel";
import { useLiveFeed, isAircraftFeature } from "./hooks/useLiveFeed";
import { useFilteredHistory } from "./hooks/useFilteredHistory";
import { useHistoryFeed } from "./hooks/useHistoryFeed";

const App: React.FC = () => {
  const { data, status, lastUpdate } = useLiveFeed();
  const [mode, setMode] = useState<AppMode>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<HighlightLocation | null>(null);

  const historyFilters = useFilteredHistory();
  const historyFeed = useHistoryFeed(mode === "history", historyFilters.filters);

  const aircraftCount = data?.features.filter(isAircraftFeature).length ?? 0;
  const detectionCount =
    data?.features.filter((feature) => !isAircraftFeature(feature)).length ?? 0;

  function handleModeChange(next: AppMode) {
    setMode(next);
    if (next === "live") {
      setSelectedId(null);
      setHighlight(null);
    }
  }

  function handleSelectLocation(loc: SelectedLocation | null) {
    if (!loc) {
      setSelectedId(null);
      setHighlight(null);
    } else {
      setSelectedId(loc.featureId);
      setHighlight({ lat: loc.lat, lon: loc.lon, label: loc.label });
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="logo" aria-hidden="true">
          🌍
        </span>
        <h1>WorldTraffic Control</h1>
        <div className="app-header__spacer" />
        <ModeToggle mode={mode} onModeChange={handleModeChange} />
      </header>

      <main className="app-content">
        <LiveMap data={data} highlightLocation={highlight} />

        <StatusPanel
          status={status}
          aircraftCount={aircraftCount}
          detectionCount={detectionCount}
          lastUpdate={lastUpdate}
        />

        {mode === "history" && (
          <HistoryPanel
            feed={historyFeed}
            filters={historyFilters}
            onSelectLocation={handleSelectLocation}
            selectedFeatureId={selectedId}
          />
        )}
      </main>
    </div>
  );
};

export default App;
