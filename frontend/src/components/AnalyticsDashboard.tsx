import React from "react";
import type { AnalyticsState, AnalyticsTimeseriesPoint } from "../hooks/useAnalytics";
import { downloadCsv, downloadJson } from "../utils/export";

interface AnalyticsDashboardProps {
  analytics: AnalyticsState;
}

function TrendChart({
  title,
  points,
  seriesKey,
  accentClass,
}: {
  title: string;
  points: AnalyticsTimeseriesPoint[];
  seriesKey: "detections" | "incidents";
  accentClass: string;
}) {
  const maxValue = Math.max(1, ...points.map((point) => point[seriesKey]));

  return (
    <div className="analytics-chart">
      <div className="analytics-chart__title">{title}</div>
      {points.length === 0 ? (
        <div className="analytics-chart__empty">No trend data for this period.</div>
      ) : (
        <div className="analytics-chart__bars">
          {points.map((point) => {
            const value = point[seriesKey];
            const height = `${Math.max((value / maxValue) * 100, value > 0 ? 8 : 0)}%`;

            return (
              <div key={`${seriesKey}-${point.bucket_start}`} className="analytics-chart__bar-group">
                <div className="analytics-chart__bar-wrap">
                  <div
                    className={`analytics-chart__bar ${accentClass}`}
                    style={{ height }}
                    title={`${point.label}: ${value}`}
                  />
                </div>
                <span className="analytics-chart__label">{point.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ analytics }) => {
  const { overview, timeseries, loading, error } = analytics;

  if (loading) {
    return <div className="history-empty">Loading analytics...</div>;
  }
  if (error) {
    return <div className="history-error">{error}</div>;
  }
  if (!overview) {
    return <div className="history-empty">No analytics are available for this view.</div>;
  }

  const currentOverview = overview;
  const detectionCategories = Object.entries(currentOverview.detections_by_category).sort(
    (a, b) => b[1] - a[1]
  );
  const incidentStatuses = Object.entries(currentOverview.incidents_by_status).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  function handleExportSummaryCsv() {
    downloadCsv("worldtraffic-analytics-summary.csv", [
      {
        total_detections: currentOverview.total_detections,
        total_aircraft_observations: currentOverview.total_aircraft_observations,
        open_alerts_count: currentOverview.open_alerts_count,
        incidents_by_status: JSON.stringify(currentOverview.incidents_by_status),
        detections_by_category: JSON.stringify(currentOverview.detections_by_category),
      },
    ]);
  }

  function handleExportJson() {
    downloadJson("worldtraffic-analytics.json", {
      overview: currentOverview,
      timeseries,
    });
  }

  return (
    <div className="analytics-panel">
      <div className="panel-toolbar panel-toolbar--analytics">
        <div className="panel-toolbar__meta">Current history filters applied</div>
        <div className="panel-toolbar__actions">
          <button
            type="button"
            className="panel-action"
            onClick={handleExportSummaryCsv}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="panel-action"
            onClick={handleExportJson}
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card">
          <span className="analytics-card__value">
            {currentOverview.total_detections.toLocaleString()}
          </span>
          <span className="analytics-card__label">Detections</span>
        </div>
        <div className="analytics-card">
          <span className="analytics-card__value">
            {currentOverview.total_aircraft_observations.toLocaleString()}
          </span>
          <span className="analytics-card__label">Aircraft observations</span>
        </div>
        <div className="analytics-card">
          <span className="analytics-card__value">
            {currentOverview.open_alerts_count.toLocaleString()}
          </span>
          <span className="analytics-card__label">Open alerts</span>
        </div>
      </div>

      <div className="analytics-section">
        <div className="history-section-label">Trend Overview</div>
        <div className="analytics-chart-grid">
          <TrendChart
            title="Detections Over Time"
            points={timeseries?.points ?? []}
            seriesKey="detections"
            accentClass="analytics-chart__bar--detections"
          />
          <TrendChart
            title="Incidents Over Time"
            points={timeseries?.points ?? []}
            seriesKey="incidents"
            accentClass="analytics-chart__bar--incidents"
          />
        </div>
      </div>

      <div className="analytics-section analytics-section--split">
        <div className="analytics-breakdown">
          <div className="history-section-label">Detections By Category</div>
          {detectionCategories.length === 0 ? (
            <div className="analytics-breakdown__empty">No detections in this period.</div>
          ) : (
            <div className="analytics-breakdown__list">
              {detectionCategories.map(([category, count]) => (
                <div key={category} className="analytics-breakdown__row">
                  <span>{category}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="analytics-breakdown">
          <div className="history-section-label">Incidents By Status</div>
          {incidentStatuses.length === 0 ? (
            <div className="analytics-breakdown__empty">No incidents in this period.</div>
          ) : (
            <div className="analytics-breakdown__list">
              {incidentStatuses.map(([status, count]) => (
                <div key={status} className="analytics-breakdown__row">
                  <span>{status}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
