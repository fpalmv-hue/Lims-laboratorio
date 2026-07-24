//⚠️ AUDITORÍA 24-jul-2026: ESTE ARCHIVO NO ESTÁ CONECTADO A NINGÚN CONTROLLER NI RUTA. // Es código huérfano (probablemente un intento anterior de motor de cálculo). // El motor real y en uso hoy es src/utils/granulometryCalc.ts (importado por // granulometry.controller.ts). NO lo importes en código nuevo sin antes // confirmar con el equipo — algunos valores aquí (ej. tolerancia N°4 en // 4.75mm) contradicen el criterio MOP 8.102.1 (N°4 = 5mm) ya corregido en // granulometryCalc.ts. Ver PROJECT_BRIEF.md sección 4.
import { GranulometrySieveInput, GranulometrySieveCalc, MopSoilQaResult } from "./types";
import { SOIL_SERIES_MOP_81021, mmEq } from "./soilSeriesMop81021";

function round(n: number, decimals = 3): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

function safePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

/**
 * Calcula % retenido y % pasa acumulado, SOLO con tamices estándar MOP 8.102.1.A
 * - Si vienen tamices fuera de norma (ej: 12,5 mm "1/2"), se excluyen de la curva/cálculo y se reporta QA.
 * - Fondo (openingMm null) no se incluye en curva semilog.
 */
export function calculateSoilMop81021(params: {
  totalDryMassZ: number;           // Z (g) masa total seca a tamizar
  sieves: GranulometrySieveInput[];// masas retenidas por tamiz
  // Si tú ya guardas residuos, igual lo puedes meter como "Fondo" retainedMass.
}) {
  const Z = params.totalDryMassZ;

  // 1) Normaliza: index por openingMm estándar
  const stdOpenings = SOIL_SERIES_MOP_81021
    .filter(s => typeof s.openingMm === "number")
    .map(s => s.openingMm as number);

  const nonStandard = params.sieves.filter(s => {
    if (typeof s.openingMm !== "number") return false; // Fondo, etc.
    return !stdOpenings.some(mm => mmEq(mm, s.openingMm as number));
  });

  // 2) Nos quedamos SOLO con estándar para cálculo
  const sievesStd = params.sieves
    .filter(s => typeof s.openingMm === "number")
    .filter(s => stdOpenings.some(mm => mmEq(mm, s.openingMm as number)))
    .map(s => ({
      ...s,
      // Forzamos etiqueta “oficial” según opening
      sieveLabel: SOIL_SERIES_MOP_81021.find(def => def.openingMm !== null && mmEq(def.openingMm, s.openingMm!))!.sieveLabel,
    }));

  // 3) Orden oficial
  const orderedDefs = SOIL_SERIES_MOP_81021.filter(d => typeof d.openingMm === "number");
  const orderedSieves: GranulometrySieveInput[] = orderedDefs.map(def => {
    const found = sievesStd.find(s => typeof s.openingMm === "number" && mmEq(s.openingMm!, def.openingMm!));
    return {
      order: def.order,
      sieveLabel: def.sieveLabel,
      openingMm: def.openingMm,
      retainedMass: found?.retainedMass ?? 0,
    };
  });

  // 4) Cálculo % retenido y % pasa
  const calc: GranulometrySieveCalc[] = [];
  let cumRetainedPct = 0;

  for (const s of orderedSieves) {
    const pr = round(safePct(s.retainedMass, Z), 3);
    cumRetainedPct += pr;
    const pp = round(Math.max(0, 100 - cumRetainedPct), 3);
    calc.push({
      ...s,
      percentRetained: pr,
      percentPassing: pp,
    });
  }

  // 5) QA (global)
  const sumRetained = orderedSieves.reduce((acc, s) => acc + (s.retainedMass ?? 0), 0);
  const errorPercentGlobal = round(Math.abs(sumRetained - Z) / (Z || 1) * 100, 3);

  // 6) QA por fracción (si tienes cómo separar por fracción con D’, C’’, residuos, etc.)
  // Aquí lo dejamos preparado para que lo conectes a tus campos del ejecutor:
  // - OverNo4: compara contra D' (masa lavada y seca sobre N°4) + residuoOver
  // - UnderNo4: compara contra C'' (masa lavada y seca bajo N°4) + residuoUnder
  // Como aún no pasaste esos campos al motor, los dejamos opcionales:
  const qa: MopSoilQaResult = {
    errorPercentGlobal,
    flags: {
      missingNo4: !calc.some(s => s.sieveLabel === "N°4"),
      missingNo200: !calc.some(s => s.sieveLabel === "N°200"),
      nonStandardSievesPresent: nonStandard.length > 0,
    },
    messages: [],
  };

  if (qa.flags.nonStandardSievesPresent) {
    const list = nonStandard
      .filter(s => typeof s.openingMm === "number")
      .map(s => `${s.sieveLabel} (${s.openingMm} mm)`)
      .join(", ");
    qa.messages.push(
      `QA: Se detectaron tamices NO estándar para suelos MOP 8.102.1.A y se excluyeron de la curva/cálculo: ${list}`
    );
  }

  if (qa.flags.missingNo4) {
    qa.messages.push(`QA: Falta tamiz N°4 (5 mm) en serie MOP suelos.`);
  }
  if (qa.flags.missingNo200) {
    qa.messages.push(`QA: Falta tamiz N°200 (0,08 mm). Sin él, finos y clasificación quedan incompletos.`);
  }

  // 7) Curve (front) — SOLO estándar, SIN Fondo, ya ordenado
  const curve = calc.map(s => ({
    x_mm: s.openingMm as number,
    y_percentPassing: s.percentPassing,
    order: s.order,
    sieveLabel: s.sieveLabel,
  }));

  return { calc, qa, curve };
}
