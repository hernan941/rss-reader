import { describe, expect, it } from "vitest";
import { updatedLabel } from "../src/views/time";

const NOW = Date.parse("2026-06-15T12:00:00Z");

describe("updatedLabel", () => {
  it("formatea la actualización de hace 5 minutos", () => {
    expect(updatedLabel([NOW - 5 * 60_000], NOW)).toBe("Actualizado hace 5 min");
  });

  it("usa la actualización más reciente e ignora cero", () => {
    expect(updatedLabel([NOW - 3_600_000, NOW - 120_000, 0], NOW)).toBe("Actualizado hace 2 min");
  });

  it("dice que fue actualizado ahora hace menos de un minuto", () => {
    expect(updatedLabel([NOW - 10_000], NOW)).toBe("Actualizado ahora");
  });

  it("queda pendiente con una lista vacía", () => {
    expect(updatedLabel([], NOW)).toBe("Pendiente de actualizar");
  });

  it("queda pendiente cuando todas las fechas son cero", () => {
    expect(updatedLabel([0, 0], NOW)).toBe("Pendiente de actualizar");
  });
});
