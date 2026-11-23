import { describe, expect, it } from "vitest";

// @ts-expect-error Los tipos de Node no están incluidos por el tsconfig del worker.
const { readFileSync } = await import("node:fs");
const css = readFileSync("public/app.css", "utf8");

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("scroll en diálogos", () => {
  it("bloquea el scroll del documento mientras hay un diálogo abierto", () => {
    expect(ruleFor("html:has(dialog[open])")).toContain("overflow: hidden");
  });

  it("contiene el overscroll del cuerpo del drawer", () => {
    expect(ruleFor(".drawer-body")).toContain("overscroll-behavior: contain");
  });
});
