import React from "react";
import type { ReplayEvent } from "../hooks/useReplay";

interface ReplayControlsProps {
  hasEvents: boolean;
  isPlaying: boolean;
  currentIndex: number;
  totalEvents: number;
  currentEvent: ReplayEvent | null;
  playbackSpeed: number;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onScrub: (index: number) => void;
  onPlaybackSpeedChange: (speed: number) => void;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const ReplayControls: React.FC<ReplayControlsProps> = ({
  hasEvents,
  isPlaying,
  currentIndex,
  totalEvents,
  currentEvent,
  playbackSpeed,
  onTogglePlayback,
  onPrevious,
  onNext,
  onScrub,
  onPlaybackSpeedChange,
}) => {
  if (!hasEvents) {
    return (
      <div className="history-replay history-replay--empty">
        <span className="history-section-label">Replay</span>
        <div className="history-replay__empty">
          No replayable events in the current history set.
        </div>
      </div>
    );
  }

  return (
    <div className="history-replay" aria-label="Replay controls">
      <div className="history-replay__header">
        <span className="history-section-label">Replay</span>
        <span className="history-replay__order">Oldest → newest</span>
      </div>

      <div className="history-replay__main">
        <div className="history-replay__actions">
          <button
            type="button"
            className="history-replay__button"
            onClick={onPrevious}
            disabled={currentIndex <= 0}
          >
            Prev
          </button>
          <button
            type="button"
            className="history-replay__button history-replay__button--primary"
            onClick={onTogglePlayback}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="history-replay__button"
            onClick={onNext}
            disabled={currentIndex >= totalEvents - 1}
          >
            Next
          </button>
        </div>

        <label className="history-replay__speed">
          <span>Speed</span>
          <select
            value={String(playbackSpeed)}
            onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </label>
      </div>

      <input
        className="history-replay__slider"
        type="range"
        min="0"
        max={String(totalEvents - 1)}
        step="1"
        value={String(Math.max(currentIndex, 0))}
        onChange={(event) => onScrub(Number(event.target.value))}
      />

      <div className="history-replay__meta">
        <span className="history-replay__position">
          Event {currentIndex + 1} / {totalEvents}
        </span>
        <span className="history-replay__timestamp">
          {formatTimestamp(currentEvent?.timestamp ?? null)}
        </span>
      </div>

      <div className="history-replay__event">
        <span className="history-replay__event-type">{currentEvent?.typeLabel}</span>
        <span className="history-replay__event-label">
          {currentEvent?.label ?? "No event selected"}
        </span>
      </div>
    </div>
  );
};

export default ReplayControls;
