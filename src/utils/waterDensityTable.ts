// src/utils/waterDensityTable.ts
//
// Tabla estandar de densidad del agua (g/cm3) vs temperatura (°C).
// Valores conocidos entre 16°C y 29°C -- fuera de este rango no se
// extrapola (criterio conservador: no inventar un valor fuera de la
// tabla de referencia).
//
// Compartida entre ensayos que la usan: Densidad de Particulas Solidas
// (NCh1532.Of80, particleDensityCalc.ts) y Cono de Arena (NCh1516.Of79,
// sandConeCalc.ts) -- misma tabla exacta, extraida aca para no duplicarla
// (confirmado con el usuario 12-ago-2026).

const WATER_DENSITY_TABLE: Array<{ tempC: number; densityGcm3: number }> = [
  { tempC: 16, densityGcm3: 0.99897 },
  { tempC: 18, densityGcm3: 0.99862 },
  { tempC: 20, densityGcm3: 0.99823 },
  { tempC: 23, densityGcm3: 0.99756 },
  { tempC: 26, densityGcm3: 0.99681 },
  { tempC: 29, densityGcm3: 0.99597 },
];

/**
 * Densidad del agua a una temperatura dada (°C), interpolando linealmente
 * entre los puntos conocidos de la tabla. Retorna null si tempC cae fuera
 * del rango cubierto (16-29°C) -- no se extrapola.
 */
export function getWaterDensityAtTemp(tempC: number): number | null {
  if (!Number.isFinite(tempC)) return null;

  const table = WATER_DENSITY_TABLE;
  if (tempC < table[0].tempC || tempC > table[table.length - 1].tempC) return null;

  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (tempC >= a.tempC && tempC <= b.tempC) {
      if (b.tempC === a.tempC) return a.densityGcm3;
      const t = (tempC - a.tempC) / (b.tempC - a.tempC);
      return a.densityGcm3 + t * (b.densityGcm3 - a.densityGcm3);
    }
  }
  return null;
}
