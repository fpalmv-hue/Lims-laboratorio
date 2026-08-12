// src/utils/waterDensityTable8102_9.ts
//
// Tabla de densidad del agua (g/cm3) vs temperatura (°C) especifica de
// MC Vol.8 §8.102.9.A (Cono de Arena). Rango 8-28°C, valores enteros de
// grado -- distinta de la tabla usada por Densidad de Particulas Solidas
// (NCh1532.Of80, 16-29°C, ver waterDensityTable.ts). NO compartir entre
// ambos ensayos aunque el concepto sea el mismo: son tablas normativas
// distintas (confirmado con el usuario 12-ago-2026).

const WATER_DENSITY_TABLE_8102_9: Array<{ tempC: number; densityGcm3: number }> = [
  { tempC: 8, densityGcm3: 0.9999 },
  { tempC: 9, densityGcm3: 0.9998 },
  { tempC: 10, densityGcm3: 0.9997 },
  { tempC: 11, densityGcm3: 0.9996 },
  { tempC: 12, densityGcm3: 0.9995 },
  { tempC: 13, densityGcm3: 0.9994 },
  { tempC: 14, densityGcm3: 0.9993 },
  { tempC: 15, densityGcm3: 0.9991 },
  { tempC: 16, densityGcm3: 0.999 },
  { tempC: 17, densityGcm3: 0.9988 },
  { tempC: 18, densityGcm3: 0.9986 },
  { tempC: 19, densityGcm3: 0.9984 },
  { tempC: 20, densityGcm3: 0.9982 },
  { tempC: 21, densityGcm3: 0.998 },
  { tempC: 22, densityGcm3: 0.9978 },
  { tempC: 23, densityGcm3: 0.9976 },
  { tempC: 24, densityGcm3: 0.9973 },
  { tempC: 25, densityGcm3: 0.9971 },
  { tempC: 26, densityGcm3: 0.9968 },
  { tempC: 27, densityGcm3: 0.9965 },
  { tempC: 28, densityGcm3: 0.9963 },
];

/**
 * Densidad del agua a una temperatura dada (°C), interpolando linealmente
 * entre los puntos conocidos de la tabla 8.102.9.A. Retorna null si
 * tempC cae fuera del rango cubierto (8-28°C) -- no se extrapola.
 */
export function getWaterDensityAtTemp8102_9(tempC: number): number | null {
  if (!Number.isFinite(tempC)) return null;

  const table = WATER_DENSITY_TABLE_8102_9;
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
