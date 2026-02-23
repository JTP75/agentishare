declare module 'ini' {
  export function parse(str: string): Record<string, Record<string, string>>;
  export function stringify(obj: object, options?: { section?: string; whitespace?: boolean }): string;
}
