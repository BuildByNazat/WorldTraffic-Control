import { useCallback, useState } from "react";

export interface MapLayerState {
  showAircraft: boolean;
  showDetections: boolean;
  showAlerts: boolean;
  showReplayHighlight: boolean;
  showSelectedHighlight: boolean;
  openAlertsOnly: boolean;
}

export interface MapLayersController {
  layers: MapLayerState;
  toggleLayer: (key: keyof MapLayerState) => void;
  setLayer: (key: keyof MapLayerState, value: boolean) => void;
}

const DEFAULT_LAYERS: MapLayerState = {
  showAircraft: true,
  showDetections: true,
  showAlerts: true,
  showReplayHighlight: true,
  showSelectedHighlight: true,
  openAlertsOnly: true,
};

export function useMapLayers(): MapLayersController {
  const [layers, setLayers] = useState<MapLayerState>(DEFAULT_LAYERS);

  const toggleLayer = useCallback((key: keyof MapLayerState) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const setLayer = useCallback((key: keyof MapLayerState, value: boolean) => {
    setLayers((current) => ({ ...current, [key]: value }));
  }, []);

  return { layers, toggleLayer, setLayer };
}
