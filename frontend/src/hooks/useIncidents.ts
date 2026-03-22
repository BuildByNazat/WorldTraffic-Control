import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../config";
import type { AlertRecord } from "./useAlerts";

export interface IncidentRecord {
  id: string;
  title: string;
  source_alert_id: string;
  category: string;
  severity: "high" | "medium" | "low";
  status: "open" | "under_review" | "closed";
  created_at: string;
  updated_at: string;
  latitude: number;
  longitude: number;
  camera_id: string | null;
  operator_notes: string;
  related_feature_ids: string[];
}

interface IncidentsResponse {
  count: number;
  incidents: IncidentRecord[];
}

export interface IncidentsState {
  incidents: IncidentRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createFromAlert: (alert: AlertRecord) => Promise<IncidentRecord | null>;
  updateStatus: (
    incidentId: string,
    status: IncidentRecord["status"]
  ) => Promise<IncidentRecord | null>;
  updateNote: (
    incidentId: string,
    operatorNotes: string
  ) => Promise<IncidentRecord | null>;
  getIncidentByAlertId: (alertId: string) => IncidentRecord | null;
}

const INCIDENT_POLL_INTERVAL_MS = 30000;

function incidentStatusRank(status: IncidentRecord["status"]): number {
  if (status === "open") return 0;
  if (status === "under_review") return 1;
  return 2;
}

function sortIncidents(records: IncidentRecord[]): IncidentRecord[] {
  return [...records].sort((a, b) => {
    const statusDiff = incidentStatusRank(a.status) - incidentStatusRank(b.status);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function useIncidents(enabled: boolean): IncidentsState {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/incidents`);
      if (!response.ok) {
        throw new Error("Failed to load incidents.");
      }

      const data = (await response.json()) as IncidentsResponse;
      if (!isMounted.current) return;
      setIncidents(sortIncidents(data.incidents));
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load incidents.");
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, INCIDENT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const createFromAlert = useCallback(
    async (alert: AlertRecord) => {
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE}/api/incidents/from-alert/${alert.id}`,
          { method: "POST" }
        );
        if (!response.ok) {
          throw new Error("Failed to create incident.");
        }

        const incident = (await response.json()) as IncidentRecord;
        if (!isMounted.current) return null;

        setIncidents((current) =>
          sortIncidents([
            incident,
            ...current.filter((item) => item.id !== incident.id),
          ])
        );
        return incident;
      } catch (err) {
        if (!isMounted.current) return null;
        setError(err instanceof Error ? err.message : "Failed to create incident.");
        return null;
      }
    },
    []
  );

  const updateStatus = useCallback(
    async (incidentId: string, status: IncidentRecord["status"]) => {
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/api/incidents/${incidentId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          throw new Error("Failed to update incident status.");
        }

        const incident = (await response.json()) as IncidentRecord;
        if (!isMounted.current) return null;

        setIncidents((current) =>
          sortIncidents(
            current.map((item) => (item.id === incident.id ? incident : item))
          )
        );
        return incident;
      } catch (err) {
        if (!isMounted.current) return null;
        setError(
          err instanceof Error ? err.message : "Failed to update incident status."
        );
        return null;
      }
    },
    []
  );

  const updateNote = useCallback(
    async (incidentId: string, operatorNotes: string) => {
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/api/incidents/${incidentId}/note`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operator_notes: operatorNotes }),
        });
        if (!response.ok) {
          throw new Error("Failed to update incident note.");
        }

        const incident = (await response.json()) as IncidentRecord;
        if (!isMounted.current) return null;

        setIncidents((current) =>
          sortIncidents(
            current.map((item) => (item.id === incident.id ? incident : item))
          )
        );
        return incident;
      } catch (err) {
        if (!isMounted.current) return null;
        setError(
          err instanceof Error ? err.message : "Failed to update incident note."
        );
        return null;
      }
    },
    []
  );

  const getIncidentByAlertId = useCallback(
    (alertId: string) =>
      incidents.find((incident) => incident.source_alert_id === alertId) ?? null,
    [incidents]
  );

  return {
    incidents,
    loading,
    error,
    refresh,
    createFromAlert,
    updateStatus,
    updateNote,
    getIncidentByAlertId,
  };
}
