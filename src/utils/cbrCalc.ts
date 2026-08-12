// src/utils/cbrCalc.ts
import prisma from "../prismaClient";

// Presiones patron NCh1852.Of81 para carga unitaria a 0.1" y 0.2" de
// penetracion (kg/cm2). Confirmadas con el usuario 11-ago-2026 -- no
// modificar sin fuente normativa explicita.
export const STANDARD_PRESSURE_01IN_KGCM2 = 70.3;
export const STANDARD_PRESSURE_02IN_KGCM2 = 105.5;

export type CbrCalcResult = {
  cbrId: number;
  designCbrPercent: number | null;
  curveJson: {
    xLabel: string;
    yLabel: string;
    points: Array<{ x: number; y: number; order: number }>;
    targetDryDensity: number | null;
    note?: string;
  };
  points: Array<{
    id: number;
    order: number;
    moldId: number;
    blowsPerLayer: number;
    waterContentPercent: number | null;
    wetMassMoldPlusSoilG: number;
    moldVolumeCm3: number;
    moldTareMassG: number;
    moldCollarMassG: number;
    moldHeightMm: number | null;
    wetSoilMassG: number;
    drySoilMassG: number;
    dryDensityGcm3: number;
    swellPercent: number | null;
    cbr01Percent: number | null;
    cbr02Percent: number | null;
    cbrPercent: number | null;
  }>;
};

/**
 * Calcula CBR desde DB leyendo:
 * - Cbr (incluye Proctor referenciado, para la DMCS)
 * - CbrPoint(s) (incluye Mold)
 *
 * Firma: 1 argumento (cbrId)
 */
export async function calculateCbrFromDb(cbrId: number): Promise<CbrCalcResult> {
  const cbr = await prisma.cbr.findUnique({
    where: { id: cbrId },
    include: {
      proctor: true,
      points: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        include: { mold: true },
      },
    },
  });

  if (!cbr) {
    return {
      cbrId,
      designCbrPercent: null,
      curveJson: {
        xLabel: "Densidad seca (g/cm³)",
        yLabel: "CBR (%)",
        points: [],
        targetDryDensity: null,
      },
      points: [],
    };
  }

  const derivedPoints: CbrCalcResult["points"] = [];

  for (const p of cbr.points ?? []) {
    const mold = (p as any).mold;
    if (!mold) continue;

    const waterContentPercent =
      (p as any).waterContentPercent !== null && (p as any).waterContentPercent !== undefined
        ? Number((p as any).waterContentPercent)
        : null;
    const wetMassMoldPlusSoilG = Number((p as any).wetMassMoldPlusSoilG);

    const moldVolumeCm3 = Number(mold.volumeCm3 ?? 0);
    const moldTareMassG = Number(mold.tareMassG ?? 0);
    const moldCollarMassG = Number(mold.collarMassG ?? 0);
    const moldHeightMm =
      mold.heightMm !== null && mold.heightMm !== undefined ? Number(mold.heightMm) : null;

    const totalTare = moldTareMassG + moldCollarMassG;
    const wetSoilMassG = wetMassMoldPlusSoilG - totalTare;

    const w = waterContentPercent !== null ? waterContentPercent / 100 : null;
    const drySoilMassG = w !== null && w > -1 ? wetSoilMassG / (1 + w) : NaN;
    const dryDensityGcm3 = moldVolumeCm3 > 0 ? drySoilMassG / moldVolumeCm3 : NaN;

    // Hinchamiento: requiere altura de probeta cargada en el catalogo de moldes.
    const swellInitial = (p as any).swellInitialDialMm;
    const swellFinal = (p as any).swellFinalDialMm;
    let swellPercent: number | null = null;
    if (
      swellInitial !== null &&
      swellInitial !== undefined &&
      swellFinal !== null &&
      swellFinal !== undefined &&
      moldHeightMm !== null &&
      moldHeightMm > 0
    ) {
      swellPercent = ((Number(swellFinal) - Number(swellInitial)) / moldHeightMm) * 100;
    }

    // Penetracion: CBR de este punto contra las presiones patron NCh1852.Of81.
    const loadAt01in = (p as any).loadAt01inKgCm2;
    const loadAt02in = (p as any).loadAt02inKgCm2;
    const cbr01Percent =
      loadAt01in !== null && loadAt01in !== undefined
        ? (Number(loadAt01in) / STANDARD_PRESSURE_01IN_KGCM2) * 100
        : null;
    const cbr02Percent =
      loadAt02in !== null && loadAt02in !== undefined
        ? (Number(loadAt02in) / STANDARD_PRESSURE_02IN_KGCM2) * 100
        : null;
    const cbrPercent =
      cbr01Percent !== null || cbr02Percent !== null
        ? Math.max(cbr01Percent ?? -Infinity, cbr02Percent ?? -Infinity)
        : null;

    derivedPoints.push({
      id: Number((p as any).id),
      order: Number((p as any).order ?? 0),
      moldId: Number((p as any).moldId),
      blowsPerLayer: Number((p as any).blowsPerLayer ?? 0),
      waterContentPercent,
      wetMassMoldPlusSoilG,
      moldVolumeCm3,
      moldTareMassG,
      moldCollarMassG,
      moldHeightMm,
      wetSoilMassG,
      drySoilMassG,
      dryDensityGcm3,
      swellPercent,
      cbr01Percent,
      cbr02Percent,
      cbrPercent,
    });
  }

  // Puntos validos para la curva densidad seca -> CBR
  const curvePoints = derivedPoints
    .filter((p) => Number.isFinite(p.dryDensityGcm3) && p.cbrPercent !== null)
    .map((p) => ({ x: p.dryDensityGcm3, y: p.cbrPercent as number, order: p.order }))
    .sort((a, b) => a.x - b.x);

  const mddDryDensity = (cbr as any).proctor?.mddDryDensity ?? null;
  const targetDryDensity =
    mddDryDensity !== null && mddDryDensity !== undefined ? Number(mddDryDensity) * 0.95 : null;

  let designCbrPercent: number | null = null;
  let note: string | undefined;

  if (targetDryDensity === null) {
    note =
      "No se pudo calcular: el Proctor de referencia todavia no tiene mddDryDensity (falta recalcular Proctor).";
  } else if (curvePoints.length < 2) {
    note = "No se pudo calcular: se necesitan al menos 2 puntos con densidad seca y CBR validos.";
  } else {
    const xMin = curvePoints[0].x;
    const xMax = curvePoints[curvePoints.length - 1].x;

    if (targetDryDensity < xMin || targetDryDensity > xMax) {
      note = `El 95% de la DMCS (${targetDryDensity.toFixed(
        3
      )} g/cm³) cae fuera del rango de densidades medidas (${xMin.toFixed(3)}–${xMax.toFixed(
        3
      )} g/cm³). No se extrapola.`;
    } else {
      // Interpolacion lineal por tramos entre los puntos que rodean el target.
      designCbrPercent = linearInterpolate(curvePoints, targetDryDensity);
    }
  }

  const curveJson: CbrCalcResult["curveJson"] = {
    xLabel: "Densidad seca (g/cm³)",
    yLabel: "CBR (%)",
    points: curvePoints,
    targetDryDensity,
    ...(note ? { note } : {}),
  };

  return {
    cbrId: cbr.id,
    designCbrPercent: designCbrPercent !== null ? roundTo(designCbrPercent, 2) : null,
    curveJson,
    points: derivedPoints,
  };
}

/* -------------------------
   Helpers
-------------------------- */

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/**
 * Interpolacion lineal por tramos sobre puntos ya ordenados por x.
 * Asume xTarget dentro de [points[0].x, points[last].x] (verificado por el caller).
 */
function linearInterpolate(
  points: Array<{ x: number; y: number }>,
  xTarget: number
): number | null {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (xTarget >= a.x && xTarget <= b.x) {
      if (b.x === a.x) return a.y;
      const t = (xTarget - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return null;
}
