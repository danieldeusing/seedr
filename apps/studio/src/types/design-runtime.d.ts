/** The estate runtime ships untyped ESM; only the two initialisers Studio calls are declared. */
declare module "@danieldeusing/design/runtime" {
  export function initTooltips(): void;
  export function initDropdowns(): void;
}
