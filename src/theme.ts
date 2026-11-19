export type Theme = "default" | "latte" | "mocha";

export function parseTheme(v: string | undefined): Theme {
  return v === "latte" || v === "mocha" ? v : "default";
}
