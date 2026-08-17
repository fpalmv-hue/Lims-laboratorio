// src/utils/losAngelesAbrasionCalc.ts
//
// Desgaste Los Angeles de Aridos -- NCh1369:2010 ("Aridos -
// Determinacion de la resistencia al desgaste por abrasion e impacto -
// Metodo de la maquina de Los Angeles"). Tablas normativas transcritas
// y verificadas por consistencia interna 17/18-ago-2026 -- ver
// CLAUDE.md para el detalle de la unica inconsistencia encontrada
// (Grado 2, corregida con Felipe: 2 fracciones, no 3).
//
// Dos datasets separados por diseño (confirmado con Felipe 18-ago-2026):
//   1. Granulometria de ORIGEN (11 tamices, cl. 7.2) -- SOLO determina
//      el grado via Anexo A. normalizeSourceSieves / determineGrade.
//   2. Carga de ensayo preparada (1 a 4 fracciones segun el grado ya
//      determinado) -- validada BLOQUEANTE contra Tabla 1.
//      validateFractions.

const EPS_MM = 1e-6;

// ---------------------------------------------------------------------
// Dataset 1 -- granulometria de origen, cl. 7.2 (11 tamices).
// ---------------------------------------------------------------------
export const SOURCE_SERIES_MM = [75, 63, 50, 37.5, 25, 19, 12.5, 9.5, 6.3, 4.75, 2.36];

// Tamices que SI aportan %ppr al calculo del Anexo A (excluye 75mm --
// es el tope de la serie, material retenido ahi es sobretamaño, no
// cuenta para ningun grado; ver ejemplo oficial del Anexo A que arranca
// en 63mm).
const ANEXO_A_SIEVES_MM = [63, 50, 37.5, 25, 19, 12.5, 9.5, 6.3, 4.75, 2.36];

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export type SourceSieveInput = { openingMm: number; retainedMass: number };

export function normalizeSourceSieves(
  sieves: SourceSieveInput[]
): { sieves: SourceSieveInput[]; error: string | null } {
  if (!Array.isArray(sieves) || sieves.length !== SOURCE_SERIES_MM.length) {
    return {
      sieves: [],
      error: `sourceSieves debe tener exactamente ${SOURCE_SERIES_MM.length} elementos (serie NCh1369 cl. 7.2: ${SOURCE_SERIES_MM.join(", ")} mm).`,
    };
  }

  const matched: (SourceSieveInput | null)[] = SOURCE_SERIES_MM.map(() => null);

  for (const raw of sieves) {
    const opening = Number(raw.openingMm);
    const mass = Number(raw.retainedMass);
    if (!Number.isFinite(opening)) {
      return { sieves: [], error: `openingMm invalido: ${raw.openingMm}` };
    }
    if (!Number.isFinite(mass) || mass < 0) {
      return { sieves: [], error: `retainedMass invalido para tamiz ${opening}mm (debe ser numerico >= 0).` };
    }
    const idx = SOURCE_SERIES_MM.findIndex((mm) => Math.abs(mm - opening) < EPS_MM);
    if (idx === -1) {
      return {
        sieves: [],
        error: `Abertura ${opening}mm no pertenece a la serie de origen NCh1369 cl. 7.2 (${SOURCE_SERIES_MM.join(", ")} mm).`,
      };
    }
    if (matched[idx] !== null) {
      return { sieves: [], error: `Tamiz ${opening}mm duplicado en sourceSieves.` };
    }
    matched[idx] = { openingMm: SOURCE_SERIES_MM[idx], retainedMass: mass };
  }

  const missing = matched
    .map((m, i) => (m === null ? SOURCE_SERIES_MM[i] : null))
    .filter((v): v is number => v !== null);
  if (missing.length > 0) {
    return { sieves: [], error: `Falta(n) tamiz(ces) de la serie de origen: ${missing.join(", ")} mm.` };
  }

  return { sieves: matched as SourceSieveInput[], error: null };
}

export type SourceSieveResult = {
  order: number;
  openingMm: number;
  retainedMass: number;
  percentRetained: number;
};

export function computeSourcePercentages(sieves: SourceSieveInput[]): SourceSieveResult[] {
  const total = sieves.reduce((acc, s) => acc + s.retainedMass, 0);
  return sieves.map((s, i) => ({
    order: i + 1,
    openingMm: s.openingMm,
    retainedMass: s.retainedMass,
    percentRetained: total > 0 ? Math.round((s.retainedMass / total) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------
// Anexo A -- asignacion de %ppr por grado (tabla transcrita y
// verificada contra el ejemplo oficial: da grado 4, sumatoria 70).
// El %ppr de cada tamiz se asigna a TODO grado cuyo rango normativo
// incluya el intervalo entre ese tamiz y el inmediatamente superior.
// ---------------------------------------------------------------------
export const GRADE_ASSIGNMENT_MM: Record<number, number[]> = {
  1: [63, 50, 37.5],
  2: [37.5, 25],
  3: [25, 19],
  4: [25, 19, 12.5, 9.5],
  5: [12.5, 9.5],
  6: [6.3, 4.75],
  7: [2.36],
};

export type GradeDeterminationResult = {
  grado: number;
  sums: Record<number, number>;
};

/**
 * Determina el grado sumando el %ppr asignado a cada grado (Anexo A) y
 * eligiendo el de mayor sumatoria. En caso de empate, se elige el grado
 * de numero mas bajo -- la norma no especifica desempate, interpretacion
 * propia (documentada en CLAUDE.md).
 */
export function determineGrade(sourceResults: SourceSieveResult[]): GradeDeterminationResult {
  const pprBySieve: Record<number, number> = {};
  for (const s of sourceResults) {
    if (ANEXO_A_SIEVES_MM.includes(s.openingMm)) pprBySieve[s.openingMm] = s.percentRetained;
  }

  const sums: Record<number, number> = {};
  for (const grado of [1, 2, 3, 4, 5, 6, 7]) {
    sums[grado] = GRADE_ASSIGNMENT_MM[grado].reduce((acc, mm) => acc + (pprBySieve[mm] ?? 0), 0);
  }

  let bestGrado = 1;
  let bestSum = sums[1];
  for (const grado of [2, 3, 4, 5, 6, 7]) {
    if (sums[grado] > bestSum) {
      bestSum = sums[grado];
      bestGrado = grado;
    }
  }

  return { grado: bestGrado, sums };
}

export function getGradeGroup(grado: number): "1-2-3" | "4-5-6-7" {
  return grado <= 3 ? "1-2-3" : "4-5-6-7";
}

// ---------------------------------------------------------------------
// Tabla 1 -- masa de fracciones de la carga de ensayo, por grado
// (cl. 7.4). Grado 2 corregido con Felipe (18-ago-2026): la
// transcripcion original tenia una tercera fraccion (37,5-25 =
// 5.000±25) que duplicaba exactamente el valor de la columna Grado 3 en
// esa misma fila -- artefacto de transcripcion. Con solo 2 fracciones
// (63-50 + 50-37,5) la suma da 10.000g exacto, coincidiendo con el
// total declarado (10.000±75) -- las otras 6 columnas ya cuadraban
// exactas sin necesidad de ajuste. Interpretacion de alta confianza,
// NO verificada linea a linea contra el PDF oficial (no disponible en
// este entorno) -- ver CLAUDE.md.
// ---------------------------------------------------------------------
export type FractionSpec = {
  label: string;
  upperMm: number;
  lowerMm: number;
  targetG: number;
  toleranceG: number;
};

export const TABLE_1: Record<number, { fractions: FractionSpec[]; totalTargetG: number; totalToleranceG: number }> = {
  1: {
    fractions: [
      { label: "75-63", upperMm: 75, lowerMm: 63, targetG: 2500, toleranceG: 50 },
      { label: "63-50", upperMm: 63, lowerMm: 50, targetG: 2500, toleranceG: 50 },
      { label: "50-37,5", upperMm: 50, lowerMm: 37.5, targetG: 5000, toleranceG: 50 },
    ],
    totalTargetG: 10000,
    totalToleranceG: 100,
  },
  2: {
    fractions: [
      { label: "63-50", upperMm: 63, lowerMm: 50, targetG: 5000, toleranceG: 50 },
      { label: "50-37,5", upperMm: 50, lowerMm: 37.5, targetG: 5000, toleranceG: 25 },
    ],
    totalTargetG: 10000,
    totalToleranceG: 75,
  },
  3: {
    fractions: [
      { label: "37,5-25", upperMm: 37.5, lowerMm: 25, targetG: 5000, toleranceG: 25 },
      { label: "25-19", upperMm: 25, lowerMm: 19, targetG: 5000, toleranceG: 25 },
    ],
    totalTargetG: 10000,
    totalToleranceG: 50,
  },
  4: {
    fractions: [
      { label: "37,5-25", upperMm: 37.5, lowerMm: 25, targetG: 1250, toleranceG: 25 },
      { label: "25-19", upperMm: 25, lowerMm: 19, targetG: 1250, toleranceG: 25 },
      { label: "19-12,5", upperMm: 19, lowerMm: 12.5, targetG: 1250, toleranceG: 10 },
      { label: "12,5-9,5", upperMm: 12.5, lowerMm: 9.5, targetG: 1250, toleranceG: 10 },
    ],
    totalTargetG: 5000,
    totalToleranceG: 10,
  },
  5: {
    fractions: [
      { label: "19-12,5", upperMm: 19, lowerMm: 12.5, targetG: 2500, toleranceG: 10 },
      { label: "12,5-9,5", upperMm: 12.5, lowerMm: 9.5, targetG: 2500, toleranceG: 10 },
    ],
    totalTargetG: 5000,
    totalToleranceG: 10,
  },
  6: {
    fractions: [
      { label: "9,5-6,3", upperMm: 9.5, lowerMm: 6.3, targetG: 2500, toleranceG: 10 },
      { label: "6,3-4,75", upperMm: 6.3, lowerMm: 4.75, targetG: 2500, toleranceG: 10 },
    ],
    totalTargetG: 5000,
    totalToleranceG: 10,
  },
  7: {
    fractions: [{ label: "4,75-2,36", upperMm: 4.75, lowerMm: 2.36, targetG: 5000, toleranceG: 10 }],
    totalTargetG: 5000,
    totalToleranceG: 10,
  },
};

export type FractionInput = { upperMm: number; lowerMm: number; massG: number };

export type FractionCheckResult = {
  label: string;
  upperMm: number;
  lowerMm: number;
  massG: number;
  targetG: number;
  toleranceG: number;
  diffG: number;
  ok: boolean;
};

export type ValidateFractionsResult = {
  fractions: FractionCheckResult[];
  totalMassG: number;
  totalTargetG: number;
  totalToleranceG: number;
  totalDiffG: number;
  totalOk: boolean;
  ok: boolean;
  error: string | null;
};

/**
 * Valida la carga de ensayo preparada contra Tabla 1 para el grado ya
 * determinado. BLOQUEANTE (confirmado con Felipe 18-ago-2026): si falta
 * o sobra una fraccion, o alguna (o el total) esta fuera de tolerancia,
 * devuelve error y el llamador debe rechazar sin persistir nada.
 */
export function validateFractions(grado: number, fractions: FractionInput[]): ValidateFractionsResult {
  const spec = TABLE_1[grado];
  const empty: ValidateFractionsResult = {
    fractions: [],
    totalMassG: 0,
    totalTargetG: spec?.totalTargetG ?? 0,
    totalToleranceG: spec?.totalToleranceG ?? 0,
    totalDiffG: 0,
    totalOk: false,
    ok: false,
    error: null,
  };

  if (!spec) return { ...empty, error: `Grado ${grado} invalido -- debe ser 1-7.` };

  if (!Array.isArray(fractions) || fractions.length !== spec.fractions.length) {
    return {
      ...empty,
      error: `La carga de ensayo para grado ${grado} debe tener exactamente ${spec.fractions.length} fraccion(es) (Tabla 1: ${spec.fractions.map((f) => f.label).join(", ")}).`,
    };
  }

  const results: FractionCheckResult[] = [];
  for (const expected of spec.fractions) {
    const match = fractions.find(
      (f) => Math.abs(f.upperMm - expected.upperMm) < EPS_MM && Math.abs(f.lowerMm - expected.lowerMm) < EPS_MM
    );
    if (!match) {
      return {
        ...empty,
        error: `Falta la fraccion ${expected.label}mm para grado ${grado} (Tabla 1).`,
      };
    }
    if (!Number.isFinite(match.massG) || match.massG < 0) {
      return { ...empty, error: `massG invalido para fraccion ${expected.label}mm.` };
    }
    const diffG = round(match.massG - expected.targetG, 1);
    results.push({
      label: expected.label,
      upperMm: expected.upperMm,
      lowerMm: expected.lowerMm,
      massG: match.massG,
      targetG: expected.targetG,
      toleranceG: expected.toleranceG,
      diffG,
      ok: Math.abs(diffG) <= expected.toleranceG,
    });
  }

  const totalMassG = round(
    results.reduce((acc, f) => acc + f.massG, 0),
    1
  );
  const totalDiffG = round(totalMassG - spec.totalTargetG, 1);
  const totalOk = Math.abs(totalDiffG) <= spec.totalToleranceG;

  const badFractions = results.filter((f) => !f.ok);
  if (badFractions.length > 0 || !totalOk) {
    const parts: string[] = [];
    for (const f of badFractions) {
      parts.push(`${f.label}mm = ${f.massG}g (objetivo ${f.targetG}±${f.toleranceG}g, diferencia ${f.diffG}g)`);
    }
    if (!totalOk) {
      parts.push(`masa total = ${totalMassG}g (objetivo ${spec.totalTargetG}±${spec.totalToleranceG}g, diferencia ${totalDiffG}g)`);
    }
    return {
      fractions: results,
      totalMassG,
      totalTargetG: spec.totalTargetG,
      totalToleranceG: spec.totalToleranceG,
      totalDiffG,
      totalOk,
      ok: false,
      error: `Carga de ensayo fuera de tolerancia NCh1369.Of2010 Tabla 1 (grado ${grado}): ${parts.join("; ")}. Debe prepararse una nueva carga de ensayo.`,
    };
  }

  return {
    fractions: results,
    totalMassG,
    totalTargetG: spec.totalTargetG,
    totalToleranceG: spec.totalToleranceG,
    totalDiffG,
    totalOk,
    ok: true,
    error: null,
  };
}

// ---------------------------------------------------------------------
// Tabla 2 -- condiciones de maquina por grado (cl. 8.2). NO son input
// del operador -- se derivan del grado ya determinado, solo referencia.
// ---------------------------------------------------------------------
export type MachineConditions = { esferasCount: number; esferasMassG: number; revolucionesCount: number };

export const TABLE_2: Record<number, MachineConditions> = {
  1: { esferasCount: 12, esferasMassG: 5000, revolucionesCount: 1000 },
  2: { esferasCount: 12, esferasMassG: 5000, revolucionesCount: 1000 },
  3: { esferasCount: 12, esferasMassG: 5000, revolucionesCount: 1000 },
  4: { esferasCount: 12, esferasMassG: 5000, revolucionesCount: 1000 },
  5: { esferasCount: 11, esferasMassG: 4585, revolucionesCount: 500 },
  6: { esferasCount: 8, esferasMassG: 3330, revolucionesCount: 500 },
  7: { esferasCount: 6, esferasMassG: 2500, revolucionesCount: 500 },
};

export function getMachineConditions(grado: number): MachineConditions | null {
  return TABLE_2[grado] ?? null;
}

// ---------------------------------------------------------------------
// cl. 9/10 -- P = (mi - mf)/mi * 100, aprox al entero mas cercano.
// ---------------------------------------------------------------------
export function computeAbrasionPercent(masaInicial: number, masaFinal: number): number | { error: string } {
  if (masaInicial <= 0) return { error: "masaInicial debe ser > 0." };
  if (masaFinal < 0 || masaFinal > masaInicial) {
    return { error: "masaFinal debe ser >= 0 y <= masaInicial." };
  }
  return Math.round(((masaInicial - masaFinal) / masaInicial) * 100);
}
