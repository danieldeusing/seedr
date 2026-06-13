import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const SCROLL_KEY_PREFIX = "scroll:";

/**
 * Hook to restore scroll position when navigating back.
 * - Forward navigation (clicking links): scroll to top
 * - Back navigation (browser back): restore previous scroll position
 */
export function useScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const key = SCROLL_KEY_PREFIX + location.pathname + location.search;
  const isRestoring = useRef(false);
  const lastKey = useRef(key);

  // Save scroll position on every scroll (debounced)
  // Use a ref to track the current key to avoid closure issues
  useEffect(() => {
    lastKey.current = key;
  }, [key]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const saveScrollPosition = () => {
      if (isRestoring.current) return;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Always save to the CURRENT key (from ref, not closure)
        sessionStorage.setItem(lastKey.current, String(window.scrollY));
      }, 50);
    };

    window.addEventListener("scroll", saveScrollPosition, { passive: true });

    // Also save immediately on mount to capture initial position
    saveScrollPosition();

    return () => {
      clearTimeout(timeoutId);
      // DON'T save on cleanup - the scroll position may have changed during navigation
      window.removeEventListener("scroll", saveScrollPosition);
    };
  }, []); // Empty deps - only set up once

  // Handle scroll on navigation
  useEffect(() => {
    // POP = back/forward button, PUSH/REPLACE = clicking links
    if (navigationType === "POP") {
      // Back navigation: restore scroll position
      const savedPosition = sessionStorage.getItem(key);
      if (savedPosition) {
        const scrollY = parseInt(savedPosition, 10);
        isRestoring.current = true;

        // Multiple attempts to restore scroll (content may load async)
        const attempts = [0, 50, 100, 200];
        const timeoutIds = attempts.map((delay) =>
          setTimeout(() => {
            window.scrollTo(0, scrollY);
          }, delay)
        );

        const resetId = setTimeout(() => {
          isRestoring.current = false;
        }, 300);

        return () => {
          timeoutIds.forEach(clearTimeout);
          clearTimeout(resetId);
          isRestoring.current = false;
        };
      }
    } else {
      // Forward navigation: scroll to top
      window.scrollTo(0, 0);
    }
  }, [key, navigationType]);
}
