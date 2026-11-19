import { describe, expect, it } from "vitest";
import { parseTheme } from "../src/theme";

describe("tema", () => {
  it("acepta Latte y Mocha", () => {
    expect(parseTheme("latte")).toBe("latte");
    expect(parseTheme("mocha")).toBe("mocha");
  });

  it("usa el tema por defecto para valores ausentes o desconocidos", () => {
    expect(parseTheme(undefined)).toBe("default");
    expect(parseTheme("")).toBe("default");
    expect(parseTheme("rojo")).toBe("default");
    expect(parseTheme("default")).toBe("default");
  });
});
