import { createContext, useContext, useReducer, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useNavigationType, type NavigationType } from "react-router-dom";
import { typeLabelPlural, typeBreadcrumbIcon, typeBreadcrumbColor, typeToPath, pathToType } from "@/lib/colors";
import { getItem } from "@/lib/registry";
import type { ComponentType } from "@/lib/types";

export interface BreadcrumbSegment {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  onClick?: () => void;
}

const CONTENT_TYPES = ["skills", "plugins", "hooks", "agents", "mcps", "settings", "commands"];

/*
 * Seedr's Back/Forward/history controls and the browser's buttons share ONE
 * history: the browser's. Every entry is identified by the index React Router
 * stores in `window.history.state.idx`, so a browser Back (a POP to an existing
 * index) moves the cursor instead of appending, a PUSH appends and truncates the
 * forward entries, and a REPLACE swaps the current entry. Our own controls are
 * just `history.go(n)`.
 */
export interface HistoryEntry {
  /** Position in the browser's session history (React Router's `idx`). */
  idx: number;
  /** Full URL incl. search params, so back/forward restore filters and ?q=. */
  path: string;
  state: unknown;
  segments: BreadcrumbSegment[];
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
}

export const EMPTY_HISTORY: HistoryState = { entries: [], currentIndex: -1 };

type HistoryAction = { type: "sync"; navigationType: NavigationType; entry: HistoryEntry };

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  const { entry } = action;
  const position = state.entries.findIndex((e) => e.idx === entry.idx);

  if (action.navigationType === "PUSH" || (action.navigationType === "REPLACE" && position === -1)) {
    // new entry: everything the browser discarded (indexes at or after it) goes too
    const kept = state.entries.filter((e) => e.idx < entry.idx);
    return { entries: [...kept, entry], currentIndex: kept.length };
  }
  if (action.navigationType === "REPLACE") {
    const entries = state.entries.slice();
    entries[position] = entry;
    return { entries, currentIndex: position };
  }
  // POP: the browser moved to an entry it already had
  if (position !== -1) {
    const entries = state.entries.slice();
    entries[position] = entry;
    return { entries, currentIndex: position };
  }
  // an entry this page never saw (created before a reload): slot it in by index
  const entries = [...state.entries, entry].sort((a, b) => a.idx - b.idx);
  return { entries, currentIndex: entries.indexOf(entry) };
}

interface NavigationContextValue {
  segments: BreadcrumbSegment[];
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  historyEntries: BreadcrumbSegment[][];
  currentHistoryIndex: number;
  goToHistory: (index: number) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}

function buildSegments(pathname: string, state: unknown, onNavigate: (path: string) => void): BreadcrumbSegment[] {
  const parts = pathname.split("/").filter(Boolean);
  const segments: BreadcrumbSegment[] = [
    { id: "home", label: "Home", icon: "home", color: "emerald", onClick: () => onNavigate("/") },
  ];

  if (parts[0] && CONTENT_TYPES.includes(parts[0])) {
    const componentType = pathToType(parts[0]);
    const fromType = (state as { from?: string } | null)?.from as ComponentType | undefined;
    const breadcrumbType = fromType && fromType !== componentType ? fromType : componentType;

    segments.push({
      id: breadcrumbType,
      label: typeLabelPlural[breadcrumbType],
      icon: typeBreadcrumbIcon[breadcrumbType],
      color: typeBreadcrumbColor[breadcrumbType],
      onClick: parts[1] ? () => onNavigate(`/${typeToPath[breadcrumbType]}`) : undefined,
    });

    if (parts[1]) {
      const item = getItem(parts[1], componentType);
      segments.push({ id: parts[1], label: item?.name || parts[1] });
    }
  } else if (parts[0] === "privacy") {
    segments.push({ id: "privacy", label: "Privacy Policy" });
  } else if (parts[0] === "impressum") {
    segments.push({ id: "impressum", label: "Impressum" });
  } else if (parts.length > 0) {
    segments.push({ id: "not-found", label: "Not Found" });
  }

  return segments;
}

function toDisplaySegments(segments: BreadcrumbSegment[]): BreadcrumbSegment[] {
  return segments.map(({ onClick: _onClick, ...rest }) => rest);
}

/** React Router's position of the current entry in the browser history. */
function currentHistoryIdx(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : 0;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [history, dispatch] = useReducer(historyReducer, EMPTY_HISTORY);

  const segments = buildSegments(location.pathname, location.state, (path) => navigate(path));

  // location.key changes on every navigation (push, replace and pop alike)
  useEffect(() => {
    dispatch({
      type: "sync",
      navigationType,
      entry: {
        idx: currentHistoryIdx(),
        path: location.pathname + location.search,
        state: location.state,
        segments: toDisplaySegments(segments),
      },
    });
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps -- segments are derived from the location

  const canGoBack = history.currentIndex > 0;
  const canGoForward = history.currentIndex >= 0 && history.currentIndex < history.entries.length - 1;

  const goBack = useCallback(() => {
    if (canGoBack) navigate(-1);
  }, [canGoBack, navigate]);

  const goForward = useCallback(() => {
    if (canGoForward) navigate(1);
  }, [canGoForward, navigate]);

  const goToHistory = useCallback(
    (index: number) => {
      const target = history.entries[index];
      const current = history.entries[history.currentIndex];
      if (!target || !current || index === history.currentIndex) return;
      navigate(target.idx - current.idx);
    },
    [history.entries, history.currentIndex, navigate]
  );

  const historyEntries = useMemo(() => history.entries.map((e) => e.segments), [history.entries]);

  return (
    <NavigationContext.Provider
      value={{
        segments,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        historyEntries,
        currentHistoryIndex: history.currentIndex,
        goToHistory,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}
