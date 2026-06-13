# JavaScript/TypeScript Linting

## Dependencies

### Base (all JS/TS projects)
```bash
npm install -D eslint typescript-eslint eslint-plugin-sonarjs eslint-plugin-unicorn eslint-config-prettier
```

### React
```bash
npm install -D eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-plugin-jsx-a11y
```

### Vue
```bash
npm install -D eslint-plugin-vue
```

### Angular
```bash
npm install -D @angular-eslint/eslint-plugin @angular-eslint/template-parser
```

## Config: eslint.config.js (Flat Config)

### Base JS/TS

```javascript
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import prettierConfig from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist/', 'node_modules/', 'coverage/']),
  {
    files: ['**/*.{js,ts,jsx,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettierConfig,
    ],
    plugins: { sonarjs, unicorn },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Complexity
      'sonarjs/cognitive-complexity': ['warn', 15],
      'max-depth': ['warn', 4],

      // Code quality
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-redundant-jump': 'warn',
      'sonarjs/prefer-single-boolean-return': 'warn',

      // Modern JS
      'unicorn/prefer-array-find': 'warn',
      'unicorn/prefer-at': 'warn',
      'unicorn/no-array-push-push': 'warn',
      'unicorn/prefer-string-slice': 'warn',
      'unicorn/prefer-ternary': 'warn',

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
```

### React Addition

Add to extends and plugins:

```javascript
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

// In config:
extends: [
  // ...base extends
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  jsxA11y.configs.recommended,
],
rules: {
  // ...base rules
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
},
```

### Vue Addition

```javascript
import vue from 'eslint-plugin-vue'

// In config:
extends: [
  // ...base extends
  ...vue.configs['flat/recommended'],
],
rules: {
  'vue/multi-word-component-names': 'warn',
  'vue/no-unused-vars': 'error',
},
```

### Angular Addition

```javascript
import angular from '@angular-eslint/eslint-plugin'

// In config:
plugins: { '@angular-eslint': angular },
rules: {
  '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
  '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
},
```

## Strictness Levels

### Relaxed
```javascript
'sonarjs/cognitive-complexity': ['warn', 20],
'@typescript-eslint/no-explicit-any': 'off',
'unicorn/prefer-ternary': 'off',
```

### Moderate (Default)
Use the base config as shown above.

### Strict
```javascript
'sonarjs/cognitive-complexity': ['error', 10],
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/explicit-function-return-type': 'warn',
'@typescript-eslint/strict-boolean-expressions': 'warn',
'unicorn/no-null': 'warn',
```

## package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```
