import React, { useEffect, useMemo, useState } from "react";
import type { IncidentsState, IncidentRecord } from "../hooks/useIncidents";
import { downloadCsv } from "../utils/export";

interface IncidentsPanelProps {
  incidentsState: IncidentsState;
  selectedIncidentId: string | null;
  onSelectIncident: (incident: IncidentRecord) => void;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const IncidentsPanel: React.FC<IncidentsPanelProps> = ({
  incidentsState,
  selectedIncidentId,
  onSelectIncident,
}) => {
  const { incidents, loading, error, refresh, updateNote, updateStatus } =
    incidentsState;
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setDraftNotes((current) =>
      incidents.reduce<Record<string, string>>((acc, incident) => {
        acc[incident.id] = current[incident.id] ?? incident.operator_notes ?? "";
        return acc;
      }, {})
    );
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return incidents;
    }

    return incidents.filter((incident) =>
      [
        incident.title,
        incident.category,
        incident.camera_id ?? "",
        incident.source_alert_id,
        ...incident.related_feature_ids,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [incidents, searchQuery]);

  function handleExport() {
    downloadCsv(
      "worldtraffic-incidents.csv",
      filteredIncidents.map((incident) => ({
        id: incident.id,
        title: incident.title,
        source_alert_id: incident.source_alert_id,
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        created_at: incident.created_at,
        updated_at: incident.updated_at,
        camera_id: incident.camera_id ?? "",
        latitude: incident.latitude,
        longitude: incident.longitude,
        operator_notes: incident.operator_notes,
        related_feature_ids: incident.related_feature_ids.join(" | "),
      }))
    );
  }

  return (
    <aside className="incidents-panel" aria-label="Incidents panel">
      <div className="incidents-panel__header">
        <div className="incidents-panel__heading">
          <span className="incidents-panel__title">Incidents</span>
          <span className="incidents-panel__subtitle">Review queue</span>
        </div>
        <button
          type="button"
          className="incidents-panel__refresh"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "Syncing" : "Sync"}
        </button>
      </div>

      <div className="panel-toolbar">
        <input
          type="text"
          className="panel-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search title, category, camera"
          aria-label="Search incidents"
        />
        <button
          type="button"
          className="panel-action"
          onClick={handleExport}
          disabled={filteredIncidents.length === 0}
        >
          Export CSV
        </button>
      </div>

      {loading && incidents.length === 0 && (
        <div className="incidents-panel__state">Loading incidents...</div>
      )}
      {error && (
        <div className="incidents-panel__state incidents-panel__state--error">
          {error}
        </div>
      )}
      {!loading && incidents.length === 0 && (
        <div className="incidents-panel__state">
          No incidents have been promoted yet. Create one from an alert when you
          want to start a review case.
        </div>
      )}
      {!loading && incidents.length > 0 && filteredIncidents.length === 0 && (
        <div className="incidents-panel__state">
          No incidents match the current search.
        </div>
      )}

      <div className="incidents-list">
        {filteredIncidents.map((incident) => {
          const isSelected = selectedIncidentId === incident.id;
          return (
            <div
              key={incident.id}
              className={`incident-card${isSelected ? " incident-card--selected" : ""}`}
            >
              <button
                type="button"
                className="incident-card__body"
                onClick={() => onSelectIncident(incident)}
              >
                <div className="incident-card__title-row">
                  <span className="incident-card__title">{incident.title}</span>
                  <span className="incident-card__status">{incident.status}</span>
                </div>
                <div className="incident-card__meta">
                  {incident.category} / {incident.severity} /{" "}
                  {formatTime(incident.created_at)}
                </div>
              </button>

              {isSelected && (
                <div className="incident-card__editor">
                  <label className="incident-card__field">
                    <span>Status</span>
                    <select
                      value={incident.status}
                      onChange={(event) => {
                        void updateStatus(
                          incident.id,
                          event.target.value as IncidentRecord["status"]
                        );
                      }}
                    >
                      <option value="open">Open</option>
                      <option value="under_review">Under review</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>

                  <label className="incident-card__field">
                    <span>Operator note</span>
                    <textarea
                      value={draftNotes[incident.id] ?? ""}
                      onChange={(event) =>
                        setDraftNotes((current) => ({
                          ...current,
                          [incident.id]: event.target.value,
                        }))
                      }
                      rows={4}
                    />
                  </label>

                  <button
                    type="button"
                    className="incident-card__save"
                    onClick={() =>
                      void updateNote(incident.id, draftNotes[incident.id] ?? "")
                    }
                  >
                    Save note
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default IncidentsPanel;
