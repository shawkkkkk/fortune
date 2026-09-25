"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ParallaxLayerProps = {
  className?: string;
  children: ReactNode;
  // "rise": translateY(start% - progress * strength%), used for the cloud bank
  // that climbs out of the Q&A section. "lift": translateY(-progress * strength px).
  mode: "rise" | "lift";
  strength: number;
  start?: number;
};

/**
 * Moves its children with the scroll position of the parent section.
 * progress = 1 - rect.bottom / (viewportHeight + rect.height), clamped to 0..1.
 */
export default function ParallaxLayer({
  className = "",
  children,
  mode,
  strength,
  start = 60,
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const section = layer?.parentElement;
    if (!layer || !section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight;
      const progress = Math.min(1, Math.max(0, 1 - rect.bottom / (viewport + rect.height)));
      const offset = progress * strength;
      layer.style.transform =
        mode === "rise"
          ? "translate3d(0, " + (start - offset) + "%, 0)"
          : "translate3d(0, " + -offset + "px, 0)";
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [mode, strength, start]);

  return (
    <div ref={ref} className={["parallaxLayer", className].filter(Boolean).join(" ")} aria-hidden="true">
      {children}
    </div>
  );
}
