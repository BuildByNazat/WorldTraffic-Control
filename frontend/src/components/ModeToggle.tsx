/**
 * ModeToggle — header control for switching between Live and History modes.
 *
 * Renders two buttons: [Live] [History]
 * The active mode is visually highlighted.
 */

import React from "react";

export type AppMode = "live" | "history";

interface ModeToggleProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange }) => {
  return (
    <div className="mode-toggle" role="group" aria-label="View mode">
      <button
        className={`mode-toggle__btn${mode === "live" ? " mode-toggle__btn--active" : ""}`}
        onClick={() => onModeChange("live")}
        aria-pressed={mode === "live"}
      >
        <span className="mode-toggle__dot mode-toggle__dot--live" aria-hidden="true" />
        Live
      </button>
      <button
        className={`mode-toggle__btn${mode === "history" ? " mode-toggle__btn--active" : ""}`}
        onClick={() => onModeChange("history")}
        aria-pressed={mode === "history"}
      >
        History
      </button>
    </div>
  );
};

export default ModeToggle;
