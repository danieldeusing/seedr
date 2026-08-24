import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["**/dist/", "**/node_modules/", "**/coverage/", "**/*.d.ts"],
  },

  // Base config for all TS/JS files
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Root Node scripts and agent hooks: plain ESM that Node runs directly, so the
  // runtime globals they use are declared here instead of pulling in `globals`.
  {
    files: ["scripts/**/*.mjs", ".agents/hooks/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
  },

  // Shared rules for all packages
  {
    files: ["**/*.{js,mjs,ts,jsx,tsx}"],
    plugins: {
      sonarjs,
      unicorn,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Complexity
      "sonarjs/cognitive-complexity": ["warn", 15],
      "max-depth": ["warn", 4],

      // Code quality
      "sonarjs/no-duplicate-string": "warn",
      "sonarjs/no-identical-functions": "warn",

      // Modern JS
      "unicorn/prefer-array-find": "warn",
      "unicorn/prefer-single-call": "warn",

      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // React-specific config for the React apps
  {
    files: ["apps/web/**/*.{jsx,tsx}", "apps/studio/**/*.{jsx,tsx}"],
    ...reactRefresh.configs.vite,
    plugins: {
      "react-hooks": reactHooks,
      ...reactRefresh.configs.vite.plugins,
    },
    rules: {
      ...reactRefresh.configs.vite.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
