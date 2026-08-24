export function scriptHash(source: string): string;
export function inlineScriptHash(html: string): string;
export function headersScriptHashes(headersText: string): string[];
export function withScriptHash(headersText: string, hash: string): string;
