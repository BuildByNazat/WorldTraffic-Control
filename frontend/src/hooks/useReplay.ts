import { useCallback, useEffect, useMemo, useState } from "react";
import type { SelectedHistoryDetail } from "../types/selectedEvent";

export interface ReplayEvent {
  eventKey: string;
  featureId: string;
  timestamp: string;
  label: string;
  typeLabel: "Detection" | "Aircraft";
  lat: number;
  lon: number;
  detail: SelectedHistoryDetail;
}

export interface ReplayState {
  currentEvent: ReplayEvent | null;
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  hasEvents: boolean;
  setPlaybackSpeed: (speed: number) => void;
  togglePlayback: () => void;
  goToNext: () => void;
  goToPrevious: () => void;
  scrubTo: (index: number) => void;
  selectEvent: (eventKey: string) => void;
  clearSelection: () => void;
}

const PLAYBACK_INTERVAL_MS = 1400;

export function useReplay(events: ReplayEvent[]): ReplayState {
  const [currentEventKey, setCurrentEventKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    if (events.length === 0) {
      setCurrentEventKey(null);
      setIsPlaying(false);
      return;
    }

    setCurrentEventKey((previous) => {
      if (previous && events.some((event) => event.eventKey === previous)) {
        return previous;
      }
      return events[0].eventKey;
    });
  }, [events]);

  const currentIndex = useMemo(
    () => events.findIndex((event) => event.eventKey === currentEventKey),
    [currentEventKey, events]
  );

  const currentEvent =
    currentIndex >= 0 && currentIndex < events.length ? events[currentIndex] : null;

  const scrubTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= events.length) return;
      setCurrentEventKey(events[index].eventKey);
    },
    [events]
  );

  const goToPrevious = useCallback(() => {
    setIsPlaying(false);
    if (events.length === 0) return;
    if (currentIndex <= 0) {
      scrubTo(0);
      return;
    }
    scrubTo(currentIndex - 1);
  }, [currentIndex, events.length, scrubTo]);

  const goToNext = useCallback(() => {
    if (events.length === 0) return;
    if (currentIndex < 0) {
      scrubTo(0);
      return;
    }
    if (currentIndex >= events.length - 1) {
      setIsPlaying(false);
      scrubTo(events.length - 1);
      return;
    }
    scrubTo(currentIndex + 1);
  }, [currentIndex, events.length, scrubTo]);

  const togglePlayback = useCallback(() => {
    if (events.length === 0) return;
    setIsPlaying((current) => !current);
  }, [events.length]);

  const selectEvent = useCallback((eventKey: string) => {
    setIsPlaying(false);
    setCurrentEventKey(eventKey);
  }, []);

  const clearSelection = useCallback(() => {
    setIsPlaying(false);
    setCurrentEventKey(null);
  }, []);

  useEffect(() => {
    if (!isPlaying || events.length === 0) return;

    const interval = window.setInterval(() => {
      setCurrentEventKey((current) => {
        const index = events.findIndex((event) => event.eventKey === current);
        if (index < 0) {
          return events[0].eventKey;
        }
        if (index >= events.length - 1) {
          setIsPlaying(false);
          return events[events.length - 1].eventKey;
        }
        return events[index + 1].eventKey;
      });
    }, PLAYBACK_INTERVAL_MS / playbackSpeed);

    return () => {
      window.clearInterval(interval);
    };
  }, [events, isPlaying, playbackSpeed]);

  return {
    currentEvent,
    currentIndex,
    isPlaying,
    playbackSpeed,
    hasEvents: events.length > 0,
    setPlaybackSpeed,
    togglePlayback,
    goToNext,
    goToPrevious,
    scrubTo,
    selectEvent,
    clearSelection,
  };
}
