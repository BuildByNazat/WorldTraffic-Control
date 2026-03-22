import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../config";

export interface AlertRecord {
  id: string;
  title: string;
  category: string;
  severity: "high" | "medium" | "low";
  timestamp: string;
  latitude: number;
  longitude: number;
  source: string;
  camera_id: string | null;
  feature_ids: string[];
  status: "new" | "acknowledged" | "resolved";
}

export interface AlertsSummary {
  total_open_alerts: number;
  alerts_by_severity: Record<string, number>;
  alerts_by_category: Record<string, number>;
}

interface AlertsResponse {
  count: number;
  alerts: AlertRecord[];
}

export interface AlertsState {
  alerts: AlertRecord[];
  summary: AlertsSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  acknowledge: (id: string) => Promise<void>;
  resolve: (id: string) => Promise<void>;
}

export function useAlerts(enabled: boolean): AlertsState {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [summary, setSummary] = useState<AlertsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const [alertsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/alerts`),
        fetch(`${API_BASE}/api/alerts/summary`),
      ]);

      if (!alertsRes.ok || !summaryRes.ok) {
        throw new Error("Failed to load alerts.");
      }

      const [alertsData, summaryData] = await Promise.all([
        alertsRes.json() as Promise<AlertsResponse>,
        summaryRes.json() as Promise<AlertsSummary>,
      ]);

      if (!isMounted.current) return;
      setAlerts(alertsData.alerts);
      setSummary(summaryData);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load alerts.");
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, refresh]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const updateAlert = useCallback(
    async (id: string, action: "acknowledge" | "resolve") => {
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/api/alerts/${id}/${action}`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(`Failed to ${action} alert.`);
        }
        await refresh();
      } catch (err) {
        if (!isMounted.current) return;
        setError(err instanceof Error ? err.message : `Failed to ${action} alert.`);
      }
    },
    [refresh]
  );

  return {
    alerts,
    summary,
    loading,
    error,
    refresh,
    acknowledge: (id: string) => updateAlert(id, "acknowledge"),
    resolve: (id: string) => updateAlert(id, "resolve"),
  };
}
