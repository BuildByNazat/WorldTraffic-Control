import React from "react";
import type { MapLayerState } from "../hooks/useMapLayers";

interface LayerControlsProps {
  layers: MapLayerState;
  onToggleLayer: (key: keyof MapLayerState) => void;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="layer-controls__row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  onToggleLayer,
}) => {
  return (
    <aside className="layer-controls" aria-label="Map layer controls">
      <div className="layer-controls__header">
        <div className="layer-controls__heading">
          <span className="layer-controls__title">Layers</span>
          <span className="layer-controls__subtitle">Map visibility</span>
        </div>
      </div>

      <div className="layer-controls__body">
        <ToggleRow
          label="Aircraft"
          checked={layers.showAircraft}
          onChange={() => onToggleLayer("showAircraft")}
        />
        <ToggleRow
          label="Detections"
          checked={layers.showDetections}
          onChange={() => onToggleLayer("showDetections")}
        />
        <ToggleRow
          label="Alerts"
          checked={layers.showAlerts}
          onChange={() => onToggleLayer("showAlerts")}
        />
        <ToggleRow
          label="Replay highlight"
          checked={layers.showReplayHighlight}
          onChange={() => onToggleLayer("showReplayHighlight")}
        />
        <ToggleRow
          label="Selected detail"
          checked={layers.showSelectedHighlight}
          onChange={() => onToggleLayer("showSelectedHighlight")}
        />
        <ToggleRow
          label="Open alerts only"
          checked={layers.openAlertsOnly}
          onChange={() => onToggleLayer("openAlertsOnly")}
        />
      </div>
    </aside>
  );
};

export default LayerControls;
