"use client";

import { useEffect, type RefObject } from "react";

type ScrollRevealOptions = {
  threshold?: number;
  rootMargin?: string;
};

const REVEAL_SELECTOR = ".reveal, .reveal-scale";

// Cards that animate in automatically when they first mount below the fold,
// so data-driven pages get the same motion without per-page markup.
const AUTO_REVEAL_SELECTOR = [
  ".launchGrid > .launchCard",
  ".automationGrid > *",
  ".docsBody > section",
  ".twoColumn > *",
  ".statusChecks > .statusCheck",
  ".launchMain > .formCard",
  ".launchMain > .advancedLaunch",
  ".launchMain > .panel",
  ".tokenGrid > .panel",
  ".page > .panel",
  ".page > .formCard",
  ".page > .registryPanel",
  ".page > .metricsGrid",
].join(", ");

declare global {
  interface Window {
    __fortuneReveal?: boolean;
  }
}

/**
 * Adds `.revealed` to every `.reveal` / `.reveal-scale` element inside `ref`
 * (or the whole document) as it enters the viewport, then stops watching it.
 * Elements hide only while `<html data-motion="on">` is set by the layout's
 * pre-paint script, so content stays visible without JavaScript or when the
 * visitor prefers reduced motion.
 */
export function useScrollReveal(
  ref?: RefObject<HTMLElement | null>,
  { threshold = 0.15, rootMargin = "0px 0px -40px 0px" }: ScrollRevealOptions = {}
) {
  useEffect(() => {
    const root = ref?.current ?? document.body;
    if (!root || typeof IntersectionObserver === "undefined") return;

    window.__fortuneReveal = true;
    const motion = document.documentElement.dataset.motion === "on";

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          .sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
          );

        visible.forEach((element, index) => {
          // Stagger cards that arrive together unless the markup set a delay.
          if (element.dataset.revealAuto && !element.style.animationDelay) {
            element.style.animationDelay = Math.min(index, 5) * 0.08 + "s";
          }
          element.classList.add("revealed");
          observer.unobserve(element);
        });
      },
      { threshold, rootMargin }
    );

    const finish = (event: AnimationEvent) => {
      const element = event.target as HTMLElement;
      if (element.classList.contains("revealed")) {
        // Drop the finished transform so it cannot create a containing block.
        element.classList.add("reveal-done");
      }
    };

    const track = (element: Element) => {
      if (!element.classList.contains("revealed")) observer.observe(element);
    };

    const autoTrack = (element: HTMLElement) => {
      if (!motion || element.classList.contains("reveal") || element.dataset.revealAuto) return;
      // Only content that starts below the fold animates; anything already on
      // screen stays put so nothing blinks after hydration.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      element.dataset.revealAuto = "true";
      element.classList.add("reveal");
      observer.observe(element);
    };

    const scan = (scope: ParentNode) => {
      scope.querySelectorAll(REVEAL_SELECTOR).forEach(track);
      scope.querySelectorAll<HTMLElement>(AUTO_REVEAL_SELECTOR).forEach(autoTrack);
    };

    scan(root);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(REVEAL_SELECTOR)) track(node);
          if (node.matches(AUTO_REVEAL_SELECTOR)) autoTrack(node);
          scan(node);
        });
      }
    });

    mutations.observe(root, { childList: true, subtree: true });
    root.addEventListener("animationend", finish);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.removeEventListener("animationend", finish);
    };
  }, [ref, threshold, rootMargin]);
}

export default function ScrollRevealRoot() {
  useScrollReveal();
  return null;
}
