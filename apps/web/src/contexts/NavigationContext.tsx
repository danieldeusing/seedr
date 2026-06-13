import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { typeLabelPlural, typeBreadcrumbIcon, typeBreadcrumbColor, typeToPath, pathToType } from "@/lib/colors";

export interface BreadcrumbSegment {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  onClick?: () => void;
}
import { getItem } from "@/lib/registry";
import type { ComponentType } from "@/lib/types";

const CONTENT_TYPES = ["skills", "plugins", "hooks", "agents", "mcps", "settings", "commands"];

interface HistoryEntry {
  // full URL incl. search params, so back/forward restore filters and ?q=
  path: string;
  state: unknown;
  segments: BreadcrumbSegment[];
}

interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
}

type HistoryAction =
  | { type: "upsert"; entry: HistoryEntry }
  | { type: "go"; index: number };

function pathnameOf(path: string): string {
  return path.split("?")[0]!;
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "upsert": {
      const current = state.entries[state.currentIndex];
      // Same page (pathname + nav state) with only search/filters changed, or a
      // StrictMode double-mount: replace the current entry in place instead of
      // pushing a duplicate, so the latest filters round-trip on back/forward.
      const samePage =
        current &&
        pathnameOf(current.path) === pathnameOf(action.entry.path) &&
        current.state === action.entry.state;
      if (samePage) {
        if (current.path === action.entry.path) return state;
        const entries = state.entries.slice();
        entries[state.currentIndex] = action.entry;
        return { ...state, entries };
      }
      return {
        entries: [...state.entries.slice(0, state.currentIndex + 1), action.entry].slice(-50),
        currentIndex: Math.min(state.currentIndex + 1, 49),
      };
    }
    case "go":
      if (action.index < 0 || action.index >= state.entries.length) return state;
      return { ...state, currentIndex: action.index };
  }
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

function buildSegments(
  pathname: string,
  state: unknown,
  onNavigate: (path: string) => void,
): BreadcrumbSegment[] {
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
      segments.push({
        id: parts[1],
        label: item?.name || parts[1],
      });
    }
  } else if (parts[0] === "privacy") {
    segments.push({ id: "privacy", label: "Privacy Policy" });
  } else if (parts[0] === "impressum") {
    segments.push({ id: "impressum", label: "Impressum" });
  }

  return segments;
}

function toDisplaySegments(segments: BreadcrumbSegment[]): BreadcrumbSegment[] {
  return segments.map(({ onClick: _onClick, ...rest }) => rest);
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isHistoryNavRef = useRef(false);
  const [history, dispatch] = useReducer(historyReducer, { entries: [], currentIndex: -1 });

  const segments = buildSegments(location.pathname, location.state, (path) => navigate(path));
  const locationKey =
    location.pathname + location.search + "|" + ((location.state as { from?: string } | null)?.from ?? "");

  useEffect(() => {
    if (isHistoryNavRef.current) {
      isHistoryNavRef.current = false;
      return;
    }

    dispatch({
      type: "upsert",
      entry: {
        path: location.pathname + location.search,
        state: location.state,
        segments: toDisplaySegments(segments),
      },
    });
  }, [locationKey]); // eslint-disable-line react-hooks/exhaustive-deps -- segments derived from locationKey

  const goBack = useCallback(() => {
    const newIndex = history.currentIndex - 1;
    if (newIndex < 0) return;
    isHistoryNavRef.current = true;
    dispatch({ type: "go", index: newIndex });
    const entry = history.entries[newIndex]!;
    navigate(entry.path, { state: entry.state });
  }, [history.currentIndex, history.entries, navigate]);

  const goForward = useCallback(() => {
    const newIndex = history.currentIndex + 1;
    if (newIndex >= history.entries.length) return;
    isHistoryNavRef.current = true;
    dispatch({ type: "go", index: newIndex });
    const entry = history.entries[newIndex]!;
    navigate(entry.path, { state: entry.state });
  }, [history.currentIndex, history.entries, navigate]);

  const goToHistory = useCallback((index: number) => {
    if (index < 0 || index >= history.entries.length || index === history.currentIndex) return;
    isHistoryNavRef.current = true;
    dispatch({ type: "go", index });
    const entry = history.entries[index]!;
    navigate(entry.path, { state: entry.state });
  }, [history.entries, history.currentIndex, navigate]);

  return (
    <NavigationContext.Provider value={{
      segments,
      canGoBack: history.currentIndex > 0,
      canGoForward: history.currentIndex < history.entries.length - 1,
      goBack,
      goForward,
      historyEntries: history.entries.map(e => e.segments),
      currentHistoryIndex: history.currentIndex,
      goToHistory,
    }}>
      {children}
    </NavigationContext.Provider>
  );
}
