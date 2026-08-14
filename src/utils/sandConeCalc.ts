// src/utils/sandConeCalc.ts
//
// Densidad en el Terreno -- Metodo del Cono de Arena, MC Vol.8 §8.102.9
// (jun-2022, adaptacion de NCh1516-79). Esta version usa §8.102.9 como
// referencia normativa principal (no NCh1516 cruda) porque especifica
// tolerancias numericas exactas que la norma base no dejaba claras.
//
// Simbolos identicos a la norma para poder auditar linea a linea:
//   Vm  = capacidad volumetrica del deposito
//   mw  = masa de agua que llena el deposito (calibracion 1)
//   ρw  = densidad del agua a la temperatura de calibracion (tabla 8.102.9.A)
//   ρA  = densidad aparente de la arena de ensayo (calibracion 2)
//   mA  = masa de arena de cada determinacion de ρA
//   mC  = masa de arena que llena el cono/embudo (calibracion 3)
//   mI  = masa inicial del aparato con arena (calibracion 3, cada repeticion)
//   mF  = masa remanente tras dejar fluir sobre superficie sin perforacion
//   mti = masa aparato+arena antes de llenar la perforacion (ensayo de campo)
//   mtf = masa aparato+arena despues de llenar la perforacion (ensayo de campo)
//   mp  = masa de arena efectivamente en la perforacion = (mti-mtf) - mC
//   mh  = masa del material humedo extraido de la perforacion
//   ms  = masa seca del material extraido
//   ω   = humedad (%), leida desde el MoistureContent referenciado
//   Vp  = volumen de la perforacion = mp / ρA
//   ρd  = densidad seca del suelo (resultado principal)
//   ρh  = densidad humeda del suelo (informativo)

import prisma from "../prismaClient";
import { getWaterDensityAtTemp8102_9 } from "./waterDensityTable8102_9";

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function variationPercent(values: number[]): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg === 0) return Infinity;
  return ((max - min) / avg) * 100;
}

// ---------------------------------------------------------------------
// Calibracion 1: capacidad volumetrica del deposito (Vm = mw / ρw)
// Aproximada a 1 cm3 (§8.102.9).
// ---------------------------------------------------------------------
export function computeDepositVolume(params: {
  massWaterG: number; // mw
  waterTempC: number;
}): { volumeCm3: number | null; note: string | null } {
  const rhoW = getWaterDensityAtTemp8102_9(params.waterTempC);
  if (rhoW === null) {
    return {
      volumeCm3: null,
      note: `La temperatura de calibracion (${params.waterTempC}°C) esta fuera de la tabla de densidad del agua 8.102.9.A (8-28°C).`,
    };
  }
  return { volumeCm3: roundTo(params.massWaterG / rhoW, 0), note: null };
}

// ---------------------------------------------------------------------
// Calibracion 2: densidad aparente de la arena (ρA)
//
// 5 determinaciones completas -> se promedian TODAS (no se descartan ni
// se eligen las 3 mas proximas). Criterio de aceptacion: variacion entre
// las 5 <= 1.5% -- si no se cumple, se rechaza el conjunto completo
// (repetir el ensayo). ρA final con 2 decimales.
// ---------------------------------------------------------------------

export const SAND_DENSITY_TOLERANCE_PERCENT = 1.5;

export type SandDensityDetermination = { order: number; maG: number; rhoAGcm3: number };

export function computeSandDensityCalibration(params: {
  depositVolumeCm3: number; // Vm, ya calibrado
  maValuesG: number[]; // 5 masas de arena crudas (una por determinacion)
}): {
  raw: SandDensityDetermination[];
  sandDensityGcm3: number | null;
  variationPercent: number | null;
  error: string | null;
} {
  const { depositVolumeCm3: Vm, maValuesG } = params;

  if (maValuesG.length !== 5) {
    return {
      raw: [],
      sandDensityGcm3: null,
      variationPercent: null,
      error: "Se requieren exactamente 5 determinaciones (maValuesG debe tener 5 valores).",
    };
  }

  const raw: SandDensityDetermination[] = maValuesG.map((maG, i) => ({
    order: i + 1,
    maG,
    rhoAGcm3: maG / Vm,
  }));

  const variation = roundTo(variationPercent(raw.map((r) => r.rhoAGcm3)), 4);

  if (variation > SAND_DENSITY_TOLERANCE_PERCENT) {
    return {
      raw,
      sandDensityGcm3: null,
      variationPercent: variation,
      error: `La variacion entre las 5 determinaciones (${variation}%) supera el ${SAND_DENSITY_TOLERANCE_PERCENT}% permitido por §8.102.9. Debe repetirse el ensayo completo.`,
    };
  }

  const sandDensityGcm3 = roundTo(
    raw.reduce((a, b) => a + b.rhoAGcm3, 0) / raw.length,
    2
  );

  return { raw, sandDensityGcm3, variationPercent: variation, error: null };
}

// ---------------------------------------------------------------------
// Calibracion 3: masa de arena que llena el cono/embudo (mC)
//
// Se repite 3 veces (mI/mF por repeticion). Criterio de aceptacion:
// variacion entre las 3 <= 1.0% -- si no se cumple, repetir. mC final =
// promedio de las 3 (default; ajustar solo si Felipe indica otro criterio).
// ---------------------------------------------------------------------

export const FUNNEL_TOLERANCE_PERCENT = 1.0;

export type FunnelDetermination = { order: number; miG: number; mfG: number; mCG: number };

export function computeFunnelCalibration(params: {
  determinations: Array<{ massInitialG: number; massFinalG: number }>; // 3 repeticiones
}): {
  raw: FunnelDetermination[];
  funnelMassG: number | null;
  variationPercent: number | null;
  error: string | null;
} {
  const { determinations } = params;

  if (determinations.length !== 3) {
    return {
      raw: [],
      funnelMassG: null,
      variationPercent: null,
      error: "Se requieren exactamente 3 determinaciones (mI/mF cada una).",
    };
  }

  const raw: FunnelDetermination[] = determinations.map((d, i) => ({
    order: i + 1,
    miG: d.massInitialG,
    mfG: d.massFinalG,
    mCG: d.massInitialG - d.massFinalG,
  }));

  if (raw.some((r) => r.mCG <= 0)) {
    return {
      raw,
      funnelMassG: null,
      variationPercent: null,
      error: "mC (mI - mF) debe ser positivo en las 3 determinaciones -- revisar las masas ingresadas.",
    };
  }

  const variation = roundTo(variationPercent(raw.map((r) => r.mCG)), 4);

  if (variation > FUNNEL_TOLERANCE_PERCENT) {
    return {
      raw,
      funnelMassG: null,
      variationPercent: variation,
      error: `La variacion entre las 3 determinaciones (${variation}%) supera el ${FUNNEL_TOLERANCE_PERCENT}% permitido por §8.102.9. Debe repetirse la calibracion.`,
    };
  }

  const funnelMassG = roundTo(
    raw.reduce((a, b) => a + b.mCG, 0) / raw.length,
    3
  );

  return { raw, funnelMassG, variationPercent: variation, error: null };
}

// ---------------------------------------------------------------------
// Calculo del ensayo de campo
// ---------------------------------------------------------------------
export type SandConeTestCalcResult = {
  sandConeTestId: number;
  mpG: number | null;
  msG: number | null;
  volumeCm3: number | null;
  dryDensityGcm3: number | null;
  wetDensityGcm3: number | null;
  calcNote: string | null;
};

export async function calculateSandConeTestFromDb(
  sandConeTestId: number
): Promise<SandConeTestCalcResult> {
  const test = await prisma.sandConeTest.findUnique({
    where: { id: sandConeTestId },
    include: { sandCone: { include: { equipment: true } }, moistureContent: true },
  });

  const empty = (note: string): SandConeTestCalcResult => ({
    sandConeTestId,
    mpG: null,
    msG: null,
    volumeCm3: null,
    dryDensityGcm3: null,
    wetDensityGcm3: null,
    calcNote: note,
  });

  if (!test) return empty("Registro no encontrado.");

  const mti = Number(test.mtiG);
  const mtf = Number(test.mtfG);
  const mh = Number(test.mhG);

  const mC = test.sandCone.funnelMassG;
  const rhoA = test.sandCone.sandDensityGcm3;
  if (mC === null || mC === undefined || rhoA === null || rhoA === undefined) {
    return empty(
      `El SandCone ${test.sandCone.equipment.code} todavia no tiene calibracion completa de embudo (mC) y/o densidad de arena (ρA).`
    );
  }

  // mp = (mti - mtf) - mC -- corrige el diseño anterior, que no restaba mC.
  const mpG = mti - mtf - Number(mC);

  const w = test.moistureContent.wPercent;
  if (w === null || w === undefined) {
    return {
      sandConeTestId,
      mpG: roundTo(mpG, 3),
      msG: null,
      volumeCm3: null,
      dryDensityGcm3: null,
      wetDensityGcm3: null,
      calcNote: `El MoistureContent referenciado (id ${test.moistureContentId}) todavia no tiene wPercent calculado.`,
    };
  }

  if (mpG <= 0) {
    return {
      sandConeTestId,
      mpG: roundTo(mpG, 3),
      msG: null,
      volumeCm3: null,
      dryDensityGcm3: null,
      wetDensityGcm3: null,
      calcNote: "mp = (mti - mtf) - mC no es positivo -- revisar las masas ingresadas.",
    };
  }

  const msG = mh / (1 + Number(w) / 100);
  const volumeCm3 = mpG / Number(rhoA); // Vp = mp / ρA

  const dryDensityGcm3 = msG / volumeCm3; // ρd = ms / Vp
  const wetDensityGcm3 = mh / volumeCm3; // ρh = mh / Vp (Nota 8: ρd = ρh/(1+ω/100), equivalente)

  return {
    sandConeTestId,
    mpG: roundTo(mpG, 3),
    msG: roundTo(msG, 3),
    volumeCm3: roundTo(volumeCm3, 3),
    dryDensityGcm3: roundTo(dryDensityGcm3, 4),
    wetDensityGcm3: roundTo(wetDensityGcm3, 4),
    calcNote: null,
  };
}
