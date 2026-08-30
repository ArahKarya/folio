import { useCallback, useEffect, useRef, useState } from "react";

interface ReadAloudOptions {
  /** Text of the page currently on screen. */
  getText: () => Promise<string>;
  /** Advance the book, then resolve once the new page is on screen. */
  next: () => void;
  rate: number;
}

export interface ReadAloud {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  togglePause: () => void;
  /** Minutes chosen for the sleep timer, or null when it is off. */
  sleepMinutes: number | null;
  setSleep: (minutes: number | null) => void;
  /** Seconds left before reading stops itself. */
  sleepLeft: number;
}

/**
 * Read-aloud built on the platform speech synthesiser: no model to ship, and
 * every target OS already has voices installed. Reading continues page by page
 * until the reader stops it or the book runs out of text.
 */
export function useReadAloud({ getText, next, rate }: ReadAloudOptions): ReadAloud {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [sleepLeft, setSleepLeft] = useState(0);
  const active = useRef(false);
  const emptyPages = useRef(0);

  const stop = useCallback(() => {
    active.current = false;
    emptyPages.current = 0;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setSleepMinutes(null);
    setSleepLeft(0);
  }, [supported]);

  const speakCurrent = useCallback(async () => {
    if (!active.current) return;
    const text = (await getText()).replace(/\s+/g, " ").trim();

    if (!text) {
      // Two blank pages in a row means the end, not a gap.
      emptyPages.current += 1;
      if (emptyPages.current > 1) {
        stop();
        return;
      }
      next();
      setTimeout(() => void speakCurrent(), 450);
      return;
    }

    emptyPages.current = 0;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.onend = () => {
      if (!active.current) return;
      next();
      // The engines need a beat to lay out the next page before its text can
      // be read back.
      setTimeout(() => void speakCurrent(), 450);
    };
    utterance.onerror = () => stop();
    window.speechSynthesis.speak(utterance);
  }, [getText, next, rate, stop]);

  const start = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    active.current = true;
    setSpeaking(true);
    setPaused(false);
    void speakCurrent();
  }, [supported, speakCurrent]);

  const togglePause = useCallback(() => {
    if (!supported || !active.current) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }, [supported]);

  const toggle = useCallback(() => {
    if (active.current) stop();
    else start();
  }, [start, stop]);

  const setSleep = useCallback((minutes: number | null) => {
    setSleepMinutes(minutes);
    setSleepLeft(minutes ? minutes * 60 : 0);
  }, []);

  // The countdown only runs while speech is actually playing, so pausing to
  // answer the door does not eat into the timer.
  useEffect(() => {
    if (!sleepMinutes || !speaking || paused) return;
    const timer = setInterval(() => {
      setSleepLeft((left) => {
        if (left <= 1) {
          stop();
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepMinutes, speaking, paused, stop]);

  // Speech keeps running after a component unmounts unless it is cancelled.
  useEffect(() => stop, [stop]);

  return {
    supported,
    speaking,
    paused,
    start,
    stop,
    toggle,
    togglePause,
    sleepMinutes,
    setSleep,
    sleepLeft,
  };
}
