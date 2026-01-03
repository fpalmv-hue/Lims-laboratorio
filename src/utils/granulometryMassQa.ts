// src/utils/granulometryMassQa.ts
// QA de cierre de masa por fracción según MOP 8.102.1 §5.10 (junio 2022)
// - Sobre 5 mm: <= 0,5 % (respecto de D')
// - Bajo 5 mm:  <= 3,0 % (respecto de C'')
// Si no se dispone de D'/C'', se informa WARNING (no se inventa).

export type MassQaStatus = "OK" | "WARNING" | "NO_CONFORME";

export type MassQaBases = {
  // D' = masa lavada y seca retenida sobre 5 mm (fracción gruesa)
  coarseBaseMass?: number | null;

  // C'' = masa cuarteada lavada y seca pasa 5 mm (fracción fina)
  fineBaseMass?: number | null;

  // Opcional: si tu ficha considera un "Residuo" adicional en la fracción gruesa
  // (en algunos flujos se registra como masa final en depósito). Si no se usa, dejar null.
  coarseResidueMass?: number | null;
};

export type MassQaFractionResult = {
  status: MassQaStatus;
  tolerancePercent: number; // 0.5 o 3.0 según §5.10
  baseMass: number | null;  // D' o C''
  recoveredMass: number;    // Σretenidos (+ residuo si aplica)
  lossPercent: number | null;
  message: string;
};

export type MassQaResult = {
  cutMm: number; // corte operativo (5 mm / No.4 ~ 4.75)
  coarse: MassQaFractionResult;
  fine: MassQaFractionResult;
  overallStatus: MassQaStatus;
  notes: string[]; // mensajes para calcNotes / auditoría
};

export type SieveForMassQa = {
  sieveLabel: string;
  openingMm: number | null;
  retainedMass: number;
};

const TOL_COARSE = 0.5; // % sobre 5 mm
const TOL_FINE = 3.0;   // % bajo 5 mm

function isFinitePos(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function sumMass(items: Array<{ retainedMass: number }>) {
  return items.reduce((acc, s) => acc + (Number.isFinite(s.retainedMass) ? s.retainedMass : 0), 0);
}

function computeLossPercent(baseMass: number, recoveredMass: number) {
  if (!(baseMass > 0)) return null;
  return (Math.abs(baseMass - recoveredMass) / baseMass) * 100;
}

/**
 * Detecta el corte de fracción gruesa/fina.
 * MOP trabaja con 5 mm y lo asocia a No.4 (4,75 mm). Si el set trae 4,75 lo tomamos como corte.
 */
function inferCutMm(sieves: SieveForMassQa[]): number {
  // Preferir un tamiz cerca de 4.75-5.00 mm
  const candidates = sieves
    .filter((s) => typeof s.openingMm === "number" && Number.isFinite(s.openingMm))
    .map((s) => s.openingMm as number);

  // Si existe 4.75 exacto, usar 4.75
  if (candidates.some((mm) => Math.abs(mm - 4.75) < 1e-6)) return 4.75;

  // Si existe 5 exacto, usar 5
  if (candidates.some((mm) => Math.abs(mm - 5.0) < 1e-6)) return 5.0;

  // Si hay algo cercano a 4.75~5.1, tomar el más cercano
  const near = candidates.filter((mm) => mm >= 4.6 && mm <= 5.2);
  if (near.length > 0) {
    near.sort((a, b) => Math.abs(a - 4.75) - Math.abs(b - 4.75));
    return near[0];
  }

  // fallback: 4.75 (No.4 estándar)
  return 4.75;
}

/**
 * QA de cierre de masa por fracción.
 * - coarseRecovered: suma de masas retenidas en tamices con openingMm >= cutMm
 * - fineRecovered: suma de masas retenidas en tamices con openingMm < cutMm + Fondo (openingMm null)
 *
 * Normativo §5.10:
 * - coarse: compara contra D' (coarseBaseMass) con tolerancia 0,5%
 * - fine: compara contra C'' (fineBaseMass) con tolerancia 3,0%
 */
export function evaluateMassClosureByFractions(
  sieves: SieveForMassQa[],
  bases?: MassQaBases
): MassQaResult {
  const cutMm = inferCutMm(sieves);

  const coarseSieves = sieves.filter((s) => typeof s.openingMm === "number" && (s.openingMm as number) >= cutMm);
  const fineSieves = sieves.filter((s) => typeof s.openingMm === "number" && (s.openingMm as number) < cutMm);
  const fondo = sieves.filter((s) => s.openingMm === null); // pan/fondo

  const coarseRecovered = sumMass(coarseSieves) + (isFiniteNonNeg(bases?.coarseResidueMass) ? (bases!.coarseResidueMass as number) : 0);
  const fineRecovered = sumMass(fineSieves) + sumMass(fondo);

  const notes: string[] = [];
  let overallStatus: MassQaStatus = "OK";

  // --- COARSE ---
  const coarseBase = isFinitePos(bases?.coarseBaseMass) ? (bases!.coarseBaseMass as number) : null;
  const coarseLoss = coarseBase ? computeLossPercent(coarseBase, coarseRecovered) : null;

  let coarseStatus: MassQaStatus;
  let coarseMsg: string;

  if (coarseBase === null) {
    coarseStatus = "WARNING";
    coarseMsg =
      "QA MOP 8.102.1 §5.10 (sobre 5 mm): no se puede evaluar sin D' (masa lavada y seca retenida sobre 5 mm).";
  } else if (coarseLoss === null) {
    coarseStatus = "WARNING";
    coarseMsg = "QA MOP 8.102.1 §5.10 (sobre 5 mm): D' inválido (<= 0).";
  } else if (coarseLoss > TOL_COARSE) {
    coarseStatus = "NO_CONFORME";
    coarseMsg = `QA MOP 8.102.1 §5.10 (sobre 5 mm): cierre ${coarseLoss.toFixed(2)} % > ${TOL_COARSE.toFixed(
      1
    )} %. Ensayo debe repetirse.`;
  } else {
    coarseStatus = "OK";
    coarseMsg = `QA MOP 8.102.1 §5.10 (sobre 5 mm): cierre ${coarseLoss.toFixed(2)} % ≤ ${TOL_COARSE.toFixed(
      1
    )} %.`;
  }

  notes.push(coarseMsg);

  // --- FINE ---
  const fineBase = isFinitePos(bases?.fineBaseMass) ? (bases!.fineBaseMass as number) : null;
  const fineLoss = fineBase ? computeLossPercent(fineBase, fineRecovered) : null;

  let fineStatus: MassQaStatus;
  let fineMsg: string;

  if (fineBase === null) {
    fineStatus = "WARNING";
    fineMsg =
      "QA MOP 8.102.1 §5.10 (bajo 5 mm): no se puede evaluar sin C'' (masa cuarteada lavada y seca pasa 5 mm).";
  } else if (fineLoss === null) {
    fineStatus = "WARNING";
    fineMsg = "QA MOP 8.102.1 §5.10 (bajo 5 mm): C'' inválido (<= 0).";
  } else if (fineLoss > TOL_FINE) {
    fineStatus = "NO_CONFORME";
    fineMsg = `QA MOP 8.102.1 §5.10 (bajo 5 mm): cierre ${fineLoss.toFixed(2)} % > ${TOL_FINE.toFixed(
      1
    )} %. Ensayo debe repetirse.`;
  } else {
    fineStatus = "OK";
    fineMsg = `QA MOP 8.102.1 §5.10 (bajo 5 mm): cierre ${fineLoss.toFixed(2)} % ≤ ${TOL_FINE.toFixed(1)} %.`;
  }

  notes.push(fineMsg);

  // --- Overall ---
  // Si cualquiera es NO_CONFORME => NO_CONFORME.
  // Si no hay bases y quedó WARNING => WARNING (no mentimos).
  if (coarseStatus === "NO_CONFORME" || fineStatus === "NO_CONFORME") {
    overallStatus = "NO_CONFORME";
  } else if (coarseStatus === "WARNING" || fineStatus === "WARNING") {
    overallStatus = "WARNING";
  } else {
    overallStatus = "OK";
  }

  return {
    cutMm,
    coarse: {
      status: coarseStatus,
      tolerancePercent: TOL_COARSE,
      baseMass: coarseBase,
      recoveredMass: coarseRecovered,
      lossPercent: coarseLoss,
      message: coarseMsg,
    },
    fine: {
      status: fineStatus,
      tolerancePercent: TOL_FINE,
      baseMass: fineBase,
      recoveredMass: fineRecovered,
      lossPercent: fineLoss,
      message: fineMsg,
    },
    overallStatus,
    notes,
  };
}
