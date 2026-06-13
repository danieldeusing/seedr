import Editor, { type Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useAppTheme } from "@/lib/useAppTheme";

// Self-host Monaco instead of @monaco-editor/react's default jsdelivr CDN, so
// no visitor data leaves for a third party (see privacy policy) and previews
// work offline / behind CDN blockers. The base editor worker is enough for
// read-only syntax highlighting; we don't need the language diagnostics workers.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};
loader.config({ monaco });

const PREVIEW_THEME = "seedr-preview";
const DARK_APP_THEMES = new Set(["green", "mono"]);

function handleEditorWillMount(monacoInstance: Monaco) {
  const isDark = DARK_APP_THEMES.has(document.documentElement.dataset.theme ?? "warm");
  const cardColor = getComputedStyle(document.documentElement).getPropertyValue("--card").trim();
  monacoInstance.editor.defineTheme(PREVIEW_THEME, {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": cardColor,
      "editorGutter.background": cardColor,
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": isDark ? "#ffffff20" : "#00000020",
      "scrollbarSlider.hoverBackground": isDark ? "#ffffff38" : "#00000038",
    },
  });
}

export function MonacoPreview({ content, language }: { content: string; language: string }) {
  // Re-mount the editor on app theme changes so the preview theme is re-defined
  const appTheme = useAppTheme();
  return (
    <Editor
      key={appTheme}
      height="100%"
      language={language}
      value={content}
      theme={PREVIEW_THEME}
      beforeMount={handleEditorWillMount}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: "off",
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 12,
        lineNumbersMinChars: 0,
        renderLineHighlight: "none",
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: { vertical: "auto", horizontal: "auto", verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
        padding: { top: 12, bottom: 12 },
        fontSize: 12,
        wordWrap: "on",
        domReadOnly: true,
        contextmenu: false,
      }}
    />
  );
}
