// src/utils/proctorCalc.ts
import prisma from "../prismaClient";

/**
 * Resultado de cálculo Proctor
 * - omcPercent: humedad óptima (%)
 * - mddDryDensity: densidad seca máxima (g/cm3)
 * - chartJson: estructura simple para graficar (puntos + curva)
 */
export type ProctorCalcResult = {
  proctorId: number;
  omcPercent: number | null;
  mddDryDensity: number | null;
  curveFit: "PARABOLA";
  points: Array<{
    id: number;
    order: number;
    moldId: number;
    waterContentPercent: number;
    wetMassMoldPlusSoilG: number;
    moldVolumeCm3: number;
    moldTareMassG: number;
    moldCollarMassG: number;
    wetSoilMassG: number;
    drySoilMassG: number;
    dryDensityGcm3: number;
  }>;
  chartJson: {
    xLabel: string;
    yLabel: string;
    points: Array<{ x: number; y: number; order: number }>;
    curve?: Array<{ x: number; y: number }>;
    fit?: { a: number; b: number; c: number; vertexX: number; vertexY: number } | null;
  };
};

/**
 * Calcula Proctor desde DB leyendo:
 * - Proctor
 * - ProctorPoint(s) (incluye Mold)
 *
 * Firma: 1 argumento (proctorId)
 */
export async function calculateProctorFromDb(proctorId: number): Promise<ProctorCalcResult> {
  // 1) traer proctor + puntos + molde
  const proctor = await prisma.proctor.findUnique({
    where: { id: proctorId },
    include: {
      points: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        include: { mold: true },
      },
    },
  });

  if (!proctor) {
    // devolvemos estructura consistente (y que el caller maneje 404 si quiere)
    return {
      proctorId,
      omcPercent: null,
      mddDryDensity: null,
      curveFit: "PARABOLA",
      points: [],
      chartJson: {
        xLabel: "Humedad (%)",
        yLabel: "Densidad seca (g/cm³)",
        points: [],
        fit: null,
      },
    };
  }

  const derivedPoints: ProctorCalcResult["points"] = [];

  for (const p of proctor.points ?? []) {
    const mold = (p as any).mold;
    if (!mold) continue;

    const waterContentPercent = Number((p as any).waterContentPercent);
    const wetMassMoldPlusSoilG = Number((p as any).wetMassMoldPlusSoilG);

    const moldVolumeCm3 = Number(mold.volumeCm3 ?? 0);
    const moldTareMassG = Number(mold.tareMassG ?? 0);
    const moldCollarMassG = Number(mold.collarMassG ?? 0);

    // tara total del conjunto (si collarMassG aplica)
    const totalTare = moldTareMassG + moldCollarMassG;

    // masa húmeda de suelo compactado
    const wetSoilMassG = wetMassMoldPlusSoilG - totalTare;

    // w en fracción
    const w = waterContentPercent / 100;

    // masa seca del suelo (aprox): Ms = Mh / (1 + w)
    const drySoilMassG = w > -1 ? wetSoilMassG / (1 + w) : NaN;

    // densidad seca (g/cm3): ρd = Ms / V
    const dryDensityGcm3 =
      moldVolumeCm3 > 0 ? drySoilMassG / moldVolumeCm3 : NaN;

    derivedPoints.push({
      id: Number((p as any).id),
      order: Number((p as any).order ?? 0),
      moldId: Number((p as any).moldId),
      waterContentPercent,
      wetMassMoldPlusSoilG,
      moldVolumeCm3,
      moldTareMassG,
      moldCollarMassG,
      wetSoilMassG,
      drySoilMassG,
      dryDensityGcm3,
    });
  }

  // puntos válidos para ajuste: x=humedad, y=densidad seca
  const fitPoints = derivedPoints
    .filter(
      (p) =>
        Number.isFinite(p.waterContentPercent) &&
        Number.isFinite(p.dryDensityGcm3) &&
        p.moldVolumeCm3 > 0 &&
        p.wetSoilMassG > 0
    )
    .map((p) => ({ x: p.waterContentPercent, y: p.dryDensityGcm3, order: p.order }));

  // 2) Ajuste parabólico si hay >= 3 puntos
  let fit: { a: number; b: number; c: number; vertexX: number; vertexY: number } | null = null;
  let omcPercent: number | null = null;
  let mddDryDensity: number | null = null;

  if (fitPoints.length >= 3) {
    fit = fitQuadraticLeastSquares(fitPoints.map(({ x, y }) => ({ x, y })));

    // vértice: x = -b/(2a), y = a x^2 + b x + c
    if (fit && Number.isFinite(fit.vertexX) && Number.isFinite(fit.vertexY)) {
      omcPercent = roundTo(fit.vertexX, 3);
      mddDryDensity = roundTo(fit.vertexY, 6);
    }
  }

  // 3) chartJson para graficar (puntos + curva)
  const chartJson: ProctorCalcResult["chartJson"] = {
    xLabel: "Humedad (%)",
    yLabel: "Densidad seca (g/cm³)",
    points: fitPoints.map((p) => ({ x: p.x, y: p.y, order: p.order })),
    fit,
  };

  if (fit && fitPoints.length >= 3) {
    const xs = fitPoints.map((p) => p.x).sort((a, b) => a - b);
    const xMin = xs[0];
    const xMax = xs[xs.length - 1];
    chartJson.curve = buildCurve(fit.a, fit.b, fit.c, xMin, xMax, 40);
  }

  return {
    proctorId: proctor.id,
    omcPercent,
    mddDryDensity,
    curveFit: "PARABOLA",
    points: derivedPoints,
    chartJson,
  };
}

/* -------------------------
   Helpers matemáticos
-------------------------- */

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function buildCurve(a: number, b: number, c: number, xMin: number, xMax: number, steps: number) {
  const curve: Array<{ x: number; y: number }> = [];
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || steps <= 1) return curve;

  const dx = (xMax - xMin) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    const x = xMin + dx * i;
    const y = a * x * x + b * x + c;
    curve.push({ x: roundTo(x, 4), y: roundTo(y, 8) });
  }
  return curve;
}

/**
 * Ajuste cuadrático por mínimos cuadrados: y = a x^2 + b x + c
 * Retorna {a,b,c} y el vértice
 */
function fitQuadraticLeastSquares(points: Array<{ x: number; y: number }>) {
  // Formamos sistema normal 3x3:
  // [Σx4  Σx3  Σx2][a] = [Σx2 y]
  // [Σx3  Σx2  Σx ][b]   [Σx  y]
  // [Σx2  Σx   n  ][c]   [Σ   y]
  let n = 0;
  let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0;
  let sy = 0, sx_y = 0, sx2_y = 0;

  for (const p of points) {
    const x = p.x;
    const y = p.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n += 1;
    const x2 = x * x;
    sx += x;
    sx2 += x2;
    sx3 += x2 * x;
    sx4 += x2 * x2;
    sy += y;
    sx_y += x * y;
    sx2_y += x2 * y;
  }

  if (n < 3) return null;

  const A = [
    [sx4, sx3, sx2],
    [sx3, sx2, sx],
    [sx2, sx,  n],
  ];
  const B = [sx2_y, sx_y, sy];

  const sol = solve3x3(A, B);
  if (!sol) return null;

  const [a, b, c] = sol;

  // vértice
  const vertexX = a !== 0 ? -b / (2 * a) : NaN;
  const vertexY = a * vertexX * vertexX + b * vertexX + c;

  return { a, b, c, vertexX, vertexY };
}

/**
 * Resuelve 3x3 por eliminación gaussiana simple
 */
function solve3x3(A: number[][], B: number[]) {
  // copia
  const M = A.map((row) => row.slice());
  const Y = B.slice();

  // forward elimination
  for (let i = 0; i < 3; i++) {
    // pivot
    let pivot = M[i][i];
    if (!Number.isFinite(pivot) || Math.abs(pivot) < 1e-12) {
      // buscar fila para swap
      let swapRow = -1;
      for (let r = i + 1; r < 3; r++) {
        if (Math.abs(M[r][i]) > 1e-12) {
          swapRow = r;
          break;
        }
      }
      if (swapRow === -1) return null;

      const tmp = M[i]; M[i] = M[swapRow]; M[swapRow] = tmp;
      const tmpY = Y[i]; Y[i] = Y[swapRow]; Y[swapRow] = tmpY;
      pivot = M[i][i];
    }

    // normalizar fila i
    const inv = 1 / pivot;
    for (let j = i; j < 3; j++) M[i][j] *= inv;
    Y[i] *= inv;

    // eliminar abajo
    for (let r = i + 1; r < 3; r++) {
      const factor = M[r][i];
      for (let j = i; j < 3; j++) M[r][j] -= factor * M[i][j];
      Y[r] -= factor * Y[i];
    }
  }

  // back substitution
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < 3; j++) sum += M[i][j] * x[j];
    x[i] = Y[i] - sum;
  }

  if (x.some((v) => !Number.isFinite(v))) return null;
  return x;
}
