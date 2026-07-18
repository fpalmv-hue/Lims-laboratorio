// src/utils/granulometryCalc.ts
//
// FIX (auditoría 18-jul-2026): este archivo definía N°4 = 4,75 mm (criterio
// ASTM D422). El laboratorio certifica bajo MOP 8.102.1 (Chile), donde
// N°4 = 5 mm. Corregido abajo. También existía un segundo motor de cálculo
// en src/domain/granulometry/ que sí usaba 5 mm pero no estaba conectado a
// ningún controller (código muerto) — se elimina esa carpeta por separado,
// este archivo queda como el único motor de granulometría del proyecto.

export type GranulometrySieveInput = {
  order: number;
  sieveLabel: string;
  openingMm: number | null;
  retainedMass: number;
};

export type GranulometryCalculatedSieve = {
  order: number;
  percentRetained: number;
  percentPassing: number;
};

export type GranulometryCalcResult = {
  sieves: GranulometryCalculatedSieve[];
  d10: number | null;
  d30: number | null;
  d60: number | null;
  cu: number | null;
  cc: number | null;
  errorPercent: number | null;
  calcNotes: string | null;
};

/**
 * Interpolación semi-log para obtener Dx a partir de:
 * X = log10(mm), Y = % pasa (lineal)
 */
export function semilogInterpolateD(
  x1mm: number,
  y1: number,
  x2mm: number,
  y2: number,
  targetY: number
): number | null {
  if (!(x1mm > 0) || !(x2mm > 0)) return null;
  if (y1 === y2) return null;

  const logx1 = Math.log10(x1mm);
  const logx2 = Math.log10(x2mm);

  const t = (targetY - y1) / (y2 - y1);
  const logx = logx1 + t * (logx2 - logx1);

  const mm = Math.pow(10, logx);
  if (!Number.isFinite(mm) || mm <= 0) return null;
  return mm;
}

function round3(n: number) {
  return Number(n.toFixed(3));
}

function safePct(n: number) {
  const r = round3(n);
  return Object.is(r, -0) ? 0 : r;
}

export function computeDValues(
  points: Array<{ openingMm: number; percentPassing: number }>
): { d10: number | null; d30: number | null; d60: number | null } {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.openingMm) && p.openingMm > 0)
    .sort((a, b) => b.openingMm - a.openingMm);

  const pickD = (target: number): number | null => {
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];

      const y1 = p1.percentPassing;
      const y2 = p2.percentPassing;

      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      if (target >= minY && target <= maxY) {
        return semilogInterpolateD(p1.openingMm, y1, p2.openingMm, y2, target);
      }
    }
    return null;
  };

  return {
    d10: pickD(10),
    d30: pickD(30),
    d60: pickD(60),
  };
}

/**
 * Cierre global simple (comparación masa total vs suma de retenidos).
 * NOTA: esto NO es el QA por fracción que exige MOP (sobre/bajo N°4 con
 * masas D', C'' y residuos lavados) — el schema de Prisma ya reserva campos
 * para eso (massOver5mm_D, errorPercentOver5mm, etc.) pero no se calculan
 * todavía. Ver ROADMAP.md, Fase 2, antes de declarar cumplimiento MOP pleno.
 */
function calcErrorPercentGlobal(sieves: GranulometrySieveInput[], totalDryMass: number): number | null {
  if (!(totalDryMass > 0)) return null;
  const sum = sieves.reduce((acc, s) => acc + (Number.isFinite(s.retainedMass) ? s.retainedMass : 0), 0);
  const errVal = Math.abs(sum - totalDryMass) / totalDryMass * 100;
  return safePct(errVal);
}

/**
 * QA de serie para SUELOS bajo MOP 8.102.1: exige N°4 (5 mm), N°10 (2 mm),
 * N°40 (0,5 mm) y N°200 (0,08 mm) + fondo para "classificationReady".
 */
export function evaluateSoilSeriesQa(inputSieves: Array<{ order: number; sieveLabel: string; openingMm: number | null }>) {
  const messages: string[] = [];

  const flags = {
    missingNo4: false,
    missingNo10: false,
    missingNo40: false,
    missingNo200: false,
    missingFineSeries: false,
    fondoNotLast: false,
    nonMonotonicOpenings: false,
    duplicateOrder: false,
    duplicateKeySieve: false,
    hasNonStandardSoilSieves: false,
  };

  const normLabel = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, "").trim();

  const isFondo = (label: string) => {
    const l = normLabel(label);
    return l.includes("fondo") || l.includes("residuo") || l === "pan";
  };

  // MOP 8.102.1.A: N°4 = 5 mm (NO 4,75 mm — ese es criterio ASTM D422)
  const isNo4 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l.includes("n°4") || l.includes("no4") || l.includes("#4") || l.includes("nº4")) return true;
    if (mm !== null && Math.abs(mm - 5) < 1e-6) return true;
    return false;
  };

  const isNo10 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l.includes("n°10") || l.includes("no10") || l.includes("#10") || l.includes("nº10")) return true;
    if (mm !== null && Math.abs(mm - 2.0) < 1e-6) return true;
    return false;
  };

  const isNo40 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l.includes("n°40") || l.includes("no40") || l.includes("#40") || l.includes("nº40")) return true;
    if (mm !== null && Math.abs(mm - 0.5) < 1e-6) return true;
    return false;
  };

  const isNo200 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l.includes("n°200") || l.includes("no200") || l.includes("#200") || l.includes("nº200")) return true;
    if (mm !== null && (Math.abs(mm - 0.08) < 1e-6 || Math.abs(mm - 0.075) < 1e-6)) return true;
    return false;
  };

  // No estándar para la serie MOP suelos (ej: 1/2" = 12,5 mm, propio de agregados, no de esta serie)
  const isNonStandardSoil = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l.includes('1/2"') || l.includes("1/2") || (mm !== null && Math.abs(mm - 12.5) < 1e-6)) return true;
    return false;
  };

  const sieves = [...inputSieves].sort((a, b) => a.order - b.order);

  const seenOrder = new Set<number>();
  for (const s of sieves) {
    if (seenOrder.has(s.order)) flags.duplicateOrder = true;
    seenOrder.add(s.order);
  }
  if (flags.duplicateOrder) messages.push("QA: Hay órdenes de tamiz duplicados (order).");

  const fondoIdxs = sieves.map((s, i) => (isFondo(s.sieveLabel) ? i : -1)).filter((i) => i >= 0);
  if (fondoIdxs.length > 0) {
    const lastIdx = Math.max(...fondoIdxs);
    if (lastIdx !== sieves.length - 1) {
      flags.fondoNotLast = true;
      messages.push("QA: Fondo/Residuo debe ser el último registro de la serie.");
    }
  }

  let prev: number | null = null;
  for (const s of sieves) {
    if (typeof s.openingMm === "number") {
      if (prev !== null && s.openingMm > prev + 1e-9) {
        flags.nonMonotonicOpenings = true;
        break;
      }
      prev = s.openingMm;
    }
  }
  if (flags.nonMonotonicOpenings) {
    messages.push("QA: Aberturas (openingMm) no son monotónicas decrecientes según order.");
  }

  const has4 = sieves.some((s) => isNo4(s.sieveLabel, s.openingMm));
  const has10 = sieves.some((s) => isNo10(s.sieveLabel, s.openingMm));
  const has40 = sieves.some((s) => isNo40(s.sieveLabel, s.openingMm));
  const has200 = sieves.some((s) => isNo200(s.sieveLabel, s.openingMm));

  flags.missingNo4 = !has4;
  flags.missingNo10 = !has10;
  flags.missingNo40 = !has40;
  flags.missingNo200 = !has200;

  flags.missingFineSeries = !(has10 && has40 && has200);

  if (flags.missingNo4) messages.push("QA: Falta tamiz N°4 (5,00 mm, serie MOP 8.102.1).");
  if (flags.missingNo10) messages.push("QA: Falta tamiz N°10 (2,00 mm).");
  if (flags.missingNo40) messages.push("QA: Falta tamiz N°40 (0,50 mm).");
  if (flags.missingNo200) messages.push("QA: Falta tamiz N°200 (0,08 mm). Sin él no se puede clasificar USCS por granulometría.");

  const nonStd = sieves.filter((s) => isNonStandardSoil(s.sieveLabel, s.openingMm));
  if (nonStd.length > 0) {
    flags.hasNonStandardSoilSieves = true;
    messages.push('QA: Se detectó tamiz "1/2\\" (12,5 mm)", no estándar para suelos en serie MOP 8.102.1 (en suelos se usa 10 mm = 3/8"). Se mantiene para curva, pero se excluye del dataset "curve" estándar.');
  }

  const countKey = { no4: 0, no10: 0, no40: 0, no200: 0 };
  for (const s of sieves) {
    if (isNo4(s.sieveLabel, s.openingMm)) countKey.no4++;
    if (isNo10(s.sieveLabel, s.openingMm)) countKey.no10++;
    if (isNo40(s.sieveLabel, s.openingMm)) countKey.no40++;
    if (isNo200(s.sieveLabel, s.openingMm)) countKey.no200++;
  }
  if (countKey.no4 > 1 || countKey.no10 > 1 || countKey.no40 > 1 || countKey.no200 > 1) {
    flags.duplicateKeySieve = true;
    messages.push("QA: Hay tamices clave duplicados (#4/#10/#40/#200).");
  }

  const classificationReady = has4 && has10 && has40 && has200 && !flags.duplicateKeySieve && !flags.duplicateOrder;

  let status: "OK" | "WARNING" | "NO_CONFORME" = "OK";
  if (!classificationReady || flags.fondoNotLast || flags.nonMonotonicOpenings || flags.duplicateOrder) status = "WARNING";

  return { status, classificationReady, flags, messages };
}

export function buildSoilCurveDataset(
  sieves: Array<{ order: number; sieveLabel: string; openingMm: number | null; percentPassing: number }>
) {
  const normLabel = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, "").trim();
  const isFondo = (label: string) => {
    const l = normLabel(label);
    return l.includes("fondo") || l.includes("residuo") || l === "pan";
  };

  const isHalfInch = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l.includes('1/2"') || l.includes("1/2") || (mm !== null && Math.abs(mm - 12.5) < 1e-6)) return true;
    return false;
  };

  return sieves
    .filter((s) => typeof s.openingMm === "number" && !isFondo(s.sieveLabel) && !isHalfInch(s.sieveLabel, s.openingMm))
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      x_mm: s.openingMm as number,
      y_percentPassing: s.percentPassing,
      order: s.order,
      sieveLabel: s.sieveLabel,
    }));
}

export function calculateGranulometry(
  sievesInput: GranulometrySieveInput[],
  totalDryMass: number
): GranulometryCalcResult {
  const sieves = [...sievesInput].sort((a, b) => a.order - b.order);

  let cumulative = 0;
  const computed: GranulometryCalculatedSieve[] = sieves.map((s) => {
    const pr = (s.retainedMass / totalDryMass) * 100;
    cumulative += pr;
    const pp = 100 - cumulative;
    return {
      order: s.order,
      percentRetained: safePct(pr),
      percentPassing: safePct(pp),
    };
  });

  const points = sieves
    .map((s) => {
      const calc = computed.find((c) => c.order === s.order);
      if (!calc) return null;
      if (typeof s.openingMm !== "number") return null;
      return { openingMm: s.openingMm, percentPassing: calc.percentPassing };
    })
    .filter(Boolean) as Array<{ openingMm: number; percentPassing: number }>;

  const { d10, d30, d60 } = computeDValues(points);

  let cu: number | null = null;
  let cc: number | null = null;

  if (d10 && d60 && d10 > 0) {
    cu = d60 / d10;
  }
  if (d10 && d30 && d60 && d10 > 0 && d60 > 0) {
    cc = (d30 * d30) / (d10 * d60);
  }

  const errorPercent = calcErrorPercentGlobal(sievesInput, totalDryMass);

  // FIX: el mensaje anterior declaraba "aceptable según tolerancia MOP / ISO
  // 17025" de forma incondicional — esto es solo un cierre de masa GLOBAL,
  // no el QA por fracción que exige MOP. Se deja explícito para no
  // sobre-declarar cumplimiento normativo en un certificado.
  let calcNotes = "Dx por interpolación semi-log (X=log(mm), Y=% pasa). Serie MOP 8.102.1.";
  if (errorPercent !== null) {
    calcNotes = `Cierre de masa global = ${errorPercent.toFixed(2)} %. Este es un control de cierre total, no reemplaza el QA por fracción (sobre/bajo N°4) que exige MOP 8.102.1 — ver ROADMAP.md Fase 2.`;
  }

  return {
    sieves: computed,
    d10: d10 !== null ? round3(d10) : null,
    d30: d30 !== null ? round3(d30) : null,
    d60: d60 !== null ? round3(d60) : null,
    cu: cu !== null ? round3(cu) : null,
    cc: cc !== null ? round3(cc) : null,
    errorPercent,
    calcNotes,
  };
}
