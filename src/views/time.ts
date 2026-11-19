export function relTime(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

export function updatedLabel(checkedAt: number[], now = Date.now()): string {
  const latest = Math.max(0, ...checkedAt);
  return latest > 0 ? `Actualizado ${relTime(latest, now)}` : "Pendiente de actualizar";
}
