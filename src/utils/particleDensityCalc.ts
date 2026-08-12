// src/utils/particleDensityCalc.ts
//
// Densidad de Particulas Solidas -- NCh1532.Of80 (equivalente ASTM
// D854-58), metodo del picnometro. Alcance de esta fase: solo particulas
// < 5mm (ver deuda tecnica en CLAUDE.md para el caso mixto con NCh1117).
//
// Simbolos identicos a la norma para poder auditar linea a linea:
//   ms  = masa seca de la muestra de ensayo
//   Mf  = masa del picnometro vacio y seco
//   Ma  = masa picnometro + agua (a una temperatura dada)
//   Mm  = masa picnometro + muestra + agua (a la temperatura de ensayo tx)
//   ti  = temperatura de calibracion del picnometro
//   tx  = temperatura de ensayo
//   ρw  = densidad del agua a una temperatura dada
//   ρs  = densidad de particulas solidas (resultado)

import prisma from "../prismaClient";

// Tabla estandar de densidad del agua (g/cm3) vs temperatura (°C).
// Valores conocidos entre 16°C y 29°C -- fuera de este rango no se
// extrapola (mismo criterio conservador que cbrCalc.ts: no inventar un
// valor fuera de la tabla de referencia).
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

export type ParticleDensityCalcResult = {
  particleDensityId: number;
  maAtTestTempG: number | null;
  waterDensityAtTestG: number | null;
  particleDensityGcm3: number | null;
  calcNote: string | null;
};

/**
 * Calcula Ma(tx) a partir de la calibracion del picnometro:
 *   Ma(tx) = Ma(ti) - Mf + Mf * [ρw(tx) / ρw(ti)]
 */
export function computeMaAtTestTemp(params: {
  massEmptyG: number; // Mf
  massWaterAtCalTempG: number; // Ma(ti)
  calibrationTempC: number; // ti
  testTempC: number; // tx
}): { maAtTestTempG: number | null; note: string | null } {
  const { massEmptyG: Mf, massWaterAtCalTempG: MaTi, calibrationTempC: ti, testTempC: tx } = params;

  const rhoWTi = getWaterDensityAtTemp(ti);
  if (rhoWTi === null) {
    return {
      maAtTestTempG: null,
      note: `La temperatura de calibracion del picnometro (${ti}°C) esta fuera de la tabla de densidad del agua (16-29°C).`,
    };
  }

  const rhoWTx = getWaterDensityAtTemp(tx);
  if (rhoWTx === null) {
    return {
      maAtTestTempG: null,
      note: `La temperatura de ensayo (${tx}°C) esta fuera de la tabla de densidad del agua (16-29°C).`,
    };
  }

  const maAtTestTempG = MaTi - Mf + Mf * (rhoWTx / rhoWTi);
  return { maAtTestTempG, note: null };
}

/**
 * Calcula Densidad de Particulas Solidas desde DB leyendo:
 * - ParticleDensity (incluye Pycnometer referenciado, para la calibracion)
 *
 * Firma: 1 argumento (particleDensityId)
 */
export async function calculateParticleDensityFromDb(
  particleDensityId: number
): Promise<ParticleDensityCalcResult> {
  const pd = await prisma.particleDensity.findUnique({
    where: { id: particleDensityId },
    include: { pycnometer: true },
  });

  if (!pd) {
    return {
      particleDensityId,
      maAtTestTempG: null,
      waterDensityAtTestG: null,
      particleDensityGcm3: null,
      calcNote: "Registro no encontrado.",
    };
  }

  const pyc = pd.pycnometer;
  if (
    pyc.massEmptyG === null ||
    pyc.massEmptyG === undefined ||
    pyc.massWaterAtCalTempG === null ||
    pyc.massWaterAtCalTempG === undefined ||
    pyc.calibrationTempC === null ||
    pyc.calibrationTempC === undefined
  ) {
    return {
      particleDensityId,
      maAtTestTempG: null,
      waterDensityAtTestG: null,
      particleDensityGcm3: null,
      calcNote: `El picnometro ${pyc.code} todavia no tiene calibracion registrada (Mf/Ma(ti)/ti).`,
    };
  }

  const ms = Number(pd.msG);
  const Mm = Number(pd.mmG);
  const tx = Number(pd.testTempC);

  const { maAtTestTempG, note: maNote } = computeMaAtTestTemp({
    massEmptyG: Number(pyc.massEmptyG),
    massWaterAtCalTempG: Number(pyc.massWaterAtCalTempG),
    calibrationTempC: Number(pyc.calibrationTempC),
    testTempC: tx,
  });

  if (maAtTestTempG === null) {
    return {
      particleDensityId,
      maAtTestTempG: null,
      waterDensityAtTestG: null,
      particleDensityGcm3: null,
      calcNote: maNote,
    };
  }

  const rhoWTx = getWaterDensityAtTemp(tx) as number; // ya validado arriba (no null)

  const denominator = ms + maAtTestTempG - Mm;
  if (denominator <= 0) {
    return {
      particleDensityId,
      maAtTestTempG: roundTo(maAtTestTempG, 4),
      waterDensityAtTestG: roundTo(rhoWTx, 5),
      particleDensityGcm3: null,
      calcNote: "El denominador (ms + Ma(tx) - Mm) no es positivo -- revisar las masas ingresadas.",
    };
  }

  const particleDensityGcm3 = (ms / denominator) * rhoWTx;

  return {
    particleDensityId,
    maAtTestTempG: roundTo(maAtTestTempG, 4),
    waterDensityAtTestG: roundTo(rhoWTx, 5),
    particleDensityGcm3: roundTo(particleDensityGcm3, 3),
    calcNote: null,
  };
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
