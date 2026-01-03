// src/utils/uscsPrelim.ts
// USCS preliminar SOLO con granulometría.
// Reglas LIMS:
// - No clasificar si falta No.200 (#200 = 0,08 mm MOP o 0,075 mm ASTM).
// - No.4 puede ser 4,75 mm (ASTM) o 5,0 mm (MOP). Preferimos el que exista.
// - Nunca usar "más cercano" sin tolerancia estricta.

export type QaStatus = "OK" | "WARNING" | "NO_CONFORME";

export interface CurvePoint {
  openingMm: number;
  percentPassing: number; // 0..100
  sieveLabel?: string | null;
}

export interface UscsPrelimInput {
  curve: CurvePoint[];
  cu?: number | null;
  cc?: number | null;
  qaStatus?: QaStatus | null;
}

export interface UscsPrelimResult {
  category: "COARSE" | "FINE" | "UNKNOWN";
  primary: "G" | "S" | null;
  grading: "W" | "P" | null;
  symbol: string | null;

  finesPercent: number | null;
  percentPassingNo200: number | null;
  percentPassingNo4: number | null;

  requiresAtterberg: boolean;
  dualSymbolZone: boolean;
  blockedByQa: boolean;
  notes: string;
}

function round2(n: number) {
  return Number(n.toFixed(2));
}

function normalizeLabel(s?: string | null) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeCurve(curve: CurvePoint[]): CurvePoint[] {
  return curve
    .filter(p => Number.isFinite(p.openingMm) && p.openingMm > 0 && Number.isFinite(p.percentPassing))
    .sort((a, b) => b.openingMm - a.openingMm)
    .map(p => ({
      openingMm: p.openingMm,
      percentPassing: Math.min(100, Math.max(0, p.percentPassing)),
      sieveLabel: p.sieveLabel ?? null,
    }));
}

/** Busca por etiqueta primero (#200, N°200, NO200), si no, por openingMm estricto */
function findPassingNo200(curve: CurvePoint[]): number | null {
  for (const p of curve) {
    const lab = normalizeLabel(p.sieveLabel);
    if (lab.includes("#200") || lab.includes("N°200") || lab.includes("NO200") || lab === "200") {
      return p.percentPassing;
    }
  }
  // fallback por openingMm, estricto
  const by008 = curve.find(p => Math.abs(p.openingMm - 0.08) <= 0.01);
  if (by008) return by008.percentPassing;

  const by0075 = curve.find(p => Math.abs(p.openingMm - 0.075) <= 0.01);
  if (by0075) return by0075.percentPassing;

  return null;
}

/** No.4: por label, o por mm (4.75 / 5.0) */
function findPassingNo4(curve: CurvePoint[]): number | null {
  for (const p of curve) {
    const lab = normalizeLabel(p.sieveLabel);
    if (lab.includes("#4") || lab.includes("N°4") || lab.includes("NO4") || lab === "4") {
      return p.percentPassing;
    }
  }
  const by5 = curve.find(p => Math.abs(p.openingMm - 5.0) <= 0.08);
  if (by5) return by5.percentPassing;

  const by475 = curve.find(p => Math.abs(p.openingMm - 4.75) <= 0.08);
  if (by475) return by475.percentPassing;

  return null;
}

function computePrimaryGS(percentPassingNo4: number, finesPercent: number): "G" | "S" | null {
  const gravel = 100 - percentPassingNo4;
  const coarse = 100 - finesPercent;
  if (coarse <= 0) return null;

  const gravelInCoarse = (gravel / coarse) * 100;
  return gravelInCoarse > 50 ? "G" : "S";
}

function gradingWP(primary: "G" | "S", cu?: number | null, cc?: number | null) {
  if (!cu || !cc) return { grading: null as any, notes: "No se pudo evaluar W/P: faltan Cu y/o Cc (requiere Dx)." };
  const ccOk = cc >= 1 && cc <= 3;

  if (primary === "G") {
    if (cu >= 4 && ccOk) return { grading: "W" as const, notes: "Grava bien graduada: Cu≥4 y 1≤Cc≤3." };
    return { grading: "P" as const, notes: "Grava mal graduada: no cumple Cu≥4 y/o 1≤Cc≤3." };
  }

  if (cu >= 6 && ccOk) return { grading: "W" as const, notes: "Arena bien graduada: Cu≥6 y 1≤Cc≤3." };
  return { grading: "P" as const, notes: "Arena mal graduada: no cumple Cu≥6 y/o 1≤Cc≤3." };
}

export function evaluateUscsPreliminary(input: UscsPrelimInput): UscsPrelimResult {
  const curve = normalizeCurve(input.curve);
  const blockedByQa = (input.qaStatus ?? "OK") === "NO_CONFORME";

  const passingNo200 = findPassingNo200(curve);
  const passingNo4 = findPassingNo4(curve);

  const base: UscsPrelimResult = {
    category: "UNKNOWN",
    primary: null,
    grading: null,
    symbol: null,

    finesPercent: passingNo200 === null ? null : round2(passingNo200),
    percentPassingNo200: passingNo200 === null ? null : round2(passingNo200),
    percentPassingNo4: passingNo4 === null ? null : round2(passingNo4),

    requiresAtterberg: false,
    dualSymbolZone: false,
    blockedByQa,
    notes: "",
  };

  if (blockedByQa) {
    base.requiresAtterberg = true;
    base.notes = "Clasificación bloqueada: ensayo NO CONFORME por QA.";
    return base;
  }

  if (passingNo200 === null) {
    base.requiresAtterberg = true;
    base.notes = "No se puede clasificar: falta tamiz No.200 (#200 = 0,08/0,075 mm) en la curva (corte normativo fino/grueso).";
    return base;
  }

  const fines = passingNo200;
  base.category = fines >= 50 ? "FINE" : "COARSE";

  if (base.category === "FINE") {
    base.requiresAtterberg = true;
    base.notes = "Suelo fino (≥50% pasa No.200). Requiere Atterberg (LL, LP, IP) para USCS.";
    return base;
  }

  if (passingNo4 === null) {
    base.requiresAtterberg = true;
    base.notes = "Suelo grueso (<50% pasa No.200), pero falta No.4 (#4 = 4,75/5,0 mm) para decidir grava/arena.";
    return base;
  }

  const primary = computePrimaryGS(passingNo4, fines);
  base.primary = primary;

  if (!primary) {
    base.requiresAtterberg = true;
    base.notes = "No se pudo decidir G/S por datos insuficientes.";
    return base;
  }

  if (fines < 5) {
    const { grading, notes } = gradingWP(primary, input.cu, input.cc);
    base.grading = grading ?? null;

    if (!grading) {
      base.requiresAtterberg = true;
      base.notes = notes;
      return base;
    }

    base.symbol = `${primary}${grading}`;
    base.notes = `USCS preliminar por granulometría: ${base.symbol}. ${notes}`;
    return base;
  }

  if (fines >= 5 && fines <= 12) {
    base.dualSymbolZone = true;
    base.requiresAtterberg = true;

    const { grading } = gradingWP(primary, input.cu, input.cc);
    base.grading = grading ?? null;
    if (grading) base.symbol = `${primary}${grading}`;

    base.notes = "Zona 5–12% finos: requiere símbolo doble y Atterberg para definir M/C (GM/GC o SM/SC).";
    return base;
  }

  base.requiresAtterberg = true;
  base.notes = ">12% finos en suelo grueso: requiere Atterberg para definir M/C y cerrar USCS.";
  return base;
}
