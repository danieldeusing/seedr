import Editor, { type Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Self-hosted Monaco, the same wiring as apps/web's MonacoPreview: the loader's
// default is a jsDelivr <script>, which the Tauri CSP (`script-src 'self'`)
// blocks. The base editor worker is enough for read-only highlighting.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};
loader.config({ monaco });

const PREVIEW_THEME = "seedr-preview";
const DARK_APP_THEMES = new Set(["green", "mono"]);

function handleEditorWillMount(monacoInstance: Monaco) {
  const isDark = DARK_APP_THEMES.has(document.documentElement.dataset.theme ?? "warm");
  // The estate tokens are plain hex per theme, which is why they can be fed
  // straight to Monaco — it rejects var() and oklch().
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

export function MonacoPreview({ content, language, appTheme }: { content: string; language: string; appTheme: string }) {
  return (
    <Editor
      // Re-mount on theme changes so the preview theme is re-defined against the new tokens.
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
