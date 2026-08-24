export interface HeaderRule {
  pattern: string;
  headers: { name: string; value: string }[];
  detach: string[];
}
export const MAX_RULES: number;
export const MAX_LINE_LENGTH: number;
export function parseHeadersFile(text: string): HeaderRule[];
export function patternToRegExp(pattern: string): RegExp;
export function headersFor(rules: HeaderRule[], path: string): [string, string][];
export function parseCsp(value: string): Map<string, string[]>;
export function inlineScripts(html: string): string[];
