// src/utils/moistureCalc.ts
//
// Determinacion de Humedad -- Manual de Carreteras Vol.8 §8.102.2
// (jun-2022, adaptacion de NCh1515-79).
//
// Simbolos identicos a la norma para poder auditar linea a linea:
//   mr = masa del recipiente solo (vacio, seco, con tapa)
//   mh = masa del recipiente + muestra humeda
//   ms = masa del recipiente + muestra seca
//   w  = humedad (%), resultado

import prisma from "../prismaClient";

export type MoistureCalcResult = {
  moistureContentId: number;
  wPercent: number | null;
  calcNote: string | null;
};

/**
 * w = 100 * (mh - ms) / (ms - mr), aproximado al 0.1% (norma).
 * ms - mr es la masa seca de la muestra (denominador): si no es positivo,
 * los datos ingresados son invalidos (mr/mh/ms mal cargados).
 */
export function computeMoisturePercent(params: {
  mrG: number;
  mhG: number;
  msG: number;
}): { wPercent: number | null; note: string | null } {
  const { mrG: mr, mhG: mh, msG: ms } = params;

  const drySoilMassG = ms - mr;
  if (drySoilMassG <= 0) {
    return {
      wPercent: null,
      note: "El denominador (ms - mr) no es positivo -- revisar las masas ingresadas.",
    };
  }

  const wPercent = (100 * (mh - ms)) / drySoilMassG;
  return { wPercent: roundTo(wPercent, 1), note: null };
}

/**
 * Calcula Determinacion de Humedad desde DB leyendo MoistureContent.
 * Firma: 1 argumento (moistureContentId), mismo patron que cbrCalc.ts /
 * particleDensityCalc.ts.
 */
export async function calculateMoistureContentFromDb(
  moistureContentId: number
): Promise<MoistureCalcResult> {
  const mc = await prisma.moistureContent.findUnique({ where: { id: moistureContentId } });

  if (!mc) {
    return { moistureContentId, wPercent: null, calcNote: "Registro no encontrado." };
  }

  const { wPercent, note } = computeMoisturePercent({
    mrG: Number(mc.mrG),
    mhG: Number(mc.mhG),
    msG: Number(mc.msG),
  });

  return { moistureContentId, wPercent, calcNote: note };
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
