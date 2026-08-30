import { useCallback, useEffect, useRef } from "react";

export type PageTransition = "slide" | "fade" | "none";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Page-turn animation for engines that swap their content instantly, which is
 * every one of them: epub.js replaces the iframe's document with no transition
 * of its own. The new page is animated in from the side it came from, which is
 * what makes a page turn read as a direction rather than a flicker.
 */
export function usePageTransition(mode: PageTransition) {
  const target = useRef<HTMLElement | null>(null);

  const play = useCallback(
    (direction: 1 | -1) => {
      const element = target.current;
      if (!element || mode === "none" || reducedMotion()) return;

      const shift = direction > 0 ? 26 : -26;
      const frames: Keyframe[] =
        mode === "fade"
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: `translateX(${shift}px)` },
              { opacity: 1, transform: "translateX(0)" },
            ];

      element.animate(frames, {
        duration: mode === "fade" ? 220 : 260,
        easing: "cubic-bezier(.16,1,.3,1)",
        fill: "none",
      });
    },
    [mode],
  );

  return { target, play };
}

/** CSS transition for engines that move their own content, such as the MOBI reader. */
export function pageTransitionCss(mode: PageTransition): string | undefined {
  if (mode === "none" || reducedMotion()) return undefined;
  return mode === "fade" ? "opacity .22s ease" : "transform .28s cubic-bezier(.16,1,.3,1)";
}

/**
 * Hands-free scrolling for comics and PDFs. Speed is in CSS pixels per second
 * and the loop stops itself at the bottom rather than spinning forever.
 */
export function useAutoScroll(
  element: () => HTMLElement | null,
  speed: number,
  running: boolean,
  onStop?: () => void,
) {
  const frame = useRef(0);
  const last = useRef(0);
  const carry = useRef(0);

  useEffect(() => {
    if (!running) return;
    last.current = performance.now();
    carry.current = 0;

    const step = (now: number) => {
      const node = element();
      if (!node) return;
      const elapsed = (now - last.current) / 1000;
      last.current = now;

      // Sub-pixel movement is accumulated; without this a slow speed would
      // round to zero every frame and nothing would move at all.
      carry.current += elapsed * speed;
      const whole = Math.floor(carry.current);
      if (whole > 0) {
        carry.current -= whole;
        const before = node.scrollTop;
        node.scrollTop = before + whole;
        if (node.scrollTop === before) {
          onStop?.();
          return;
        }
      }
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [running, speed, element, onStop]);
}
