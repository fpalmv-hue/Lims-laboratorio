// src/utils/granulometryCalc.ts
//
// FIX (auditoría 18-jul-2026): este archivo definía N°4 = 4,75 mm (criterio
// ASTM D422). El laboratorio certifica bajo MOP 8.102.1 (Chile), donde
// N°4 = 5 mm. Corregido abajo.
//
// FIX (auditoria 01-ago-2026): falso positivo QA N°40 -- ver isNo40 abajo.
//
// REDISEÑO (auditoria 02-ago-2026): implementacion completa del
// procedimiento MOP 8.102.1 Seccion 6 (formulario 8.102.1.A, Manual de
// Carreteras Vol. 8, Junio 2022), aportado por el usuario. Hasta esta
// version, percentRetained/percentPassing se calculaban con una formula
// simplificada (retainedMass/totalDryMass), que NO es la formula oficial
// cuando la muestra requiere separacion por lavado en tamiz 5mm (caso mas
// comun del laboratorio). Reemplazado por las formulas 6.2 y 6.3 de la
// norma, mas el QA de cierre por fraccion (% de perdida) con las
// tolerancias explicitas de 5.10.

export type GranulometryFractionLabel = "OVER_5MM" | "UNDER_5MM";

export type GranulometrySieveInput = {
  order: number;
  sieveLabel: string;
  openingMm: number | null;
  retainedMass: number;
  fraction: GranulometryFractionLabel;
};

export type GranulometryCalculatedSieve = {
  order: number;
  percentRetained: number;
  percentPassing: number;
};

// Balance de masas del procedimiento MOP 8.102.1 (Seccion 5). Nombres de
// variable calcados literalmente de la norma para que el codigo se pueda
// auditar linea a linea contra el texto oficial:
//   D  : masa seca inicial retenida en tamiz 5mm (antes de lavar)
//   D' : masa seca LAVADA retenida en 5mm (5.4.f)
//   C  : masa seca inicial que pasa 5mm (5.3)
//   C' : masa de la submuestra reducida por cuarteo de C, 500-1000g (5.6)
//   C'': masa de esa submuestra ya lavada y seca (5.7)
//   residueOver5mm / residueUnder5mm : fila "Residuo" de cada tabla del
//     formulario 8.102.1.A (el "pan" al final de cada serie de tamizado)
export type GranulometryMassBalanceInput = {
  massOver5mm_D: number | null;
  massOver5mm_Dprime: number | null;
  residueOver5mm: number | null;
  massUnder5mm_C: number | null;
  massUnder5mm_Cprime: number | null;
  massUnder5mm_CprimeWashed: number | null;
  residueUnder5mm: number | null;
};

export type GranulometryFractionQa = {
  errorPercentOver5mm: number | null;
  errorPercentUnder5mm: number | null;
  qaStatus: "OK" | "WARNING" | "NO_CONFORME" | "SIN_DATOS";
  messages: string[];
};

export type GranulometryCalcResult = {
  sieves: GranulometryCalculatedSieve[];
  d10: number | null;
  d30: number | null;
  d60: number | null;
  cu: number | null;
  cc: number | null;
  errorPercent: number | null;
  fractionQa: GranulometryFractionQa;
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
 * Cierre global simple: masa total tamizada (Z, ~= totalDryMass) vs suma
 * de retenidos. Es un chequeo de consistencia informativo, NO el QA
 * normativo de MOP (ese es fractionQa, ver evaluateFractionMassBalance).
 */
function calcErrorPercentGlobal(sieves: GranulometrySieveInput[], totalDryMass: number): number | null {
  if (!(totalDryMass > 0)) return null;
  const sum = sieves.reduce((acc, s) => acc + (Number.isFinite(s.retainedMass) ? s.retainedMass : 0), 0);
  const errVal = Math.abs(sum - totalDryMass) / totalDryMass * 100;
  return safePct(errVal);
}

/**
 * QA de cierre por fraccion, MOP 8.102.1 §5.10 y formulario 8.102.1.A.
 *
 * Formula oficial de "% de perdida" (calcada del formulario):
 *   sobre 5mm:  ((D' - (Sum Mi_sobre5mm + residueOver5mm)) / D') x 100
 *   bajo 5mm:   ((C'' - (Sum Mi_bajo5mm + residueUnder5mm)) / C'') x 100
 *
 * Tolerancias explicitas de §5.10: "La suma de todas las masas no debe
 * diferir en más de 3% para el material bajo 5 mm, ni en más de 0,5%
 * para el material sobre 5 mm ... En caso contrario, repita el ensaye."
 * Por eso, exceder la tolerancia es NO_CONFORME (bloqueante), no solo
 * una advertencia.
 *
 * Si D es null/0 (la muestra nunca tuvo fraccion gruesa, ej. un suelo
 * fino que pasa completo 5mm), el chequeo sobre-5mm se omite (no aplica).
 * Analogo para C bajo-5mm, aunque en la practica del laboratorio siempre
 * hay fraccion fina.
 */
export function evaluateFractionMassBalance(
  sieves: GranulometrySieveInput[],
  balance: GranulometryMassBalanceInput
): GranulometryFractionQa {
  const messages: string[] = [];

  const sumOver = sieves
    .filter((s) => s.fraction === "OVER_5MM")
    .reduce((acc, s) => acc + (Number.isFinite(s.retainedMass) ? s.retainedMass : 0), 0);
  const sumUnder = sieves
    .filter((s) => s.fraction === "UNDER_5MM")
    .reduce((acc, s) => acc + (Number.isFinite(s.retainedMass) ? s.retainedMass : 0), 0);

  const hasOverFraction = balance.massOver5mm_D !== null && balance.massOver5mm_D > 0;
  const hasUnderFraction = balance.massUnder5mm_C !== null && balance.massUnder5mm_C > 0;

  let errorPercentOver5mm: number | null = null;
  let errorPercentUnder5mm: number | null = null;
  let overOk = true;
  let underOk = true;
  let overMissingData = false;
  let underMissingData = false;

  if (hasOverFraction) {
    const Dprime = balance.massOver5mm_Dprime;
    const residue = balance.residueOver5mm ?? 0;
    if (Dprime === null || !(Dprime > 0)) {
      messages.push(
        "QA: Hay fraccion sobre 5mm (D>0) pero falta D' (masa lavada retenida en 5mm) -- no se puede calcular el cierre normativo."
      );
      overOk = false;
      overMissingData = true;
      errorPercentOver5mm = null;
    } else {
      const pct = ((Dprime - (sumOver + residue)) / Dprime) * 100;
      errorPercentOver5mm = safePct(pct);
      if (Math.abs(errorPercentOver5mm) > 0.5) {
        overOk = false;
        messages.push(
          `QA: Cierre sobre 5mm = ${errorPercentOver5mm.toFixed(2)}% (tolerancia MOP 8.102.1 §5.10: ±0,5%). Repetir el ensaye.`
        );
      }
    }
  }

  if (hasUnderFraction) {
    const Cdouble = balance.massUnder5mm_CprimeWashed;
    const residue = balance.residueUnder5mm ?? 0;
    if (Cdouble === null || !(Cdouble > 0)) {
      messages.push(
        "QA: Falta C'' (masa lavada y seca de la submuestra bajo 5mm) -- no se puede calcular el cierre normativo."
      );
      underOk = false;
      underMissingData = true;
      errorPercentUnder5mm = null;
    } else {
      const pct = ((Cdouble - (sumUnder + residue)) / Cdouble) * 100;
      errorPercentUnder5mm = safePct(pct);
      if (Math.abs(errorPercentUnder5mm) > 3) {
        underOk = false;
        messages.push(
          `QA: Cierre bajo 5mm = ${errorPercentUnder5mm.toFixed(2)}% (tolerancia MOP 8.102.1 §5.10: ±3%). Repetir el ensaye.`
        );
      }
    }
  }

  // Chequeo de consistencia: que cada tamiz este etiquetado con la
  // fraccion que le corresponde por su abertura (no bloqueante, solo
  // aviso -- protege contra error de tipeo al cargar datos).
  for (const s of sieves) {
    if (s.openingMm === null) continue;
    if (s.fraction === "OVER_5MM" && s.openingMm < 5) {
      messages.push(
        `QA: El tamiz "${s.sieveLabel}" (${s.openingMm}mm) esta marcado como serie sobre-5mm pero su abertura es menor a 5mm.`
      );
    }
    if (s.fraction === "UNDER_5MM" && s.openingMm >= 5) {
      messages.push(
        `QA: El tamiz "${s.sieveLabel}" (${s.openingMm}mm) esta marcado como serie bajo-5mm pero su abertura es mayor o igual a 5mm.`
      );
    }
  }

  let qaStatus: GranulometryFractionQa["qaStatus"];
  if (!hasOverFraction && !hasUnderFraction) {
    qaStatus = "SIN_DATOS";
  } else if (!overOk || !underOk) {
    const anyRealFailure =
      (hasOverFraction && !overOk && !overMissingData) ||
      (hasUnderFraction && !underOk && !underMissingData);
    const anyMissingData = (hasOverFraction && overMissingData) || (hasUnderFraction && underMissingData);
    qaStatus = anyRealFailure ? "NO_CONFORME" : anyMissingData ? "WARNING" : "OK";
  } else {
    qaStatus = "OK";
  }

  return { errorPercentOver5mm, errorPercentUnder5mm, qaStatus, messages };
}

/**
 * QA de serie para SUELOS bajo MOP 8.102.1: exige N°4 (5 mm), N°10 (2 mm),
 * N°40 (0,425 mm) y N°200 (0,075 mm) + fondo para "classificationReady".
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

  // MOP 8.102.1.A: N°4 = 5 mm (NO 4,75 mm -- ese es criterio ASTM D422)
  const isNo4 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l === "n4" || l.includes("n°4") || l.includes("no4") || l.includes("#4") || l.includes("nº4")) return true;
    if (mm !== null && Math.abs(mm - 5) < 1e-6) return true;
    return false;
  };

  const isNo10 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l === "n10" || l.includes("n°10") || l.includes("no10") || l.includes("#10") || l.includes("nº10")) return true;
    if (mm !== null && Math.abs(mm - 2.0) < 1e-6) return true;
    return false;
  };

  const isNo40 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l === "n40" || l.includes("n°40") || l.includes("no40") || l.includes("#40") || l.includes("nº40")) return true;
    if (mm !== null && Math.abs(mm - 0.425) < 1e-6) return true;
    return false;
  };

  const isNo200 = (label: string, mm: number | null) => {
    const l = normLabel(label);
    if (l === "n200" || l.includes("n°200") || l.includes("no200") || l.includes("#200") || l.includes("nº200")) return true;
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
  if (flags.missingNo40) messages.push("QA: Falta tamiz N°40 (0,425 mm).");
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

/**
 * Motor principal. Calcula percentRetained/percentPassing por tamiz
 * segun las formulas oficiales MOP 8.102.1 §6.2 (serie sobre 5mm, sobre
 * D') y §6.3 (serie bajo 5mm, sobre C''), NO segun retainedMass/totalMasa
 * simple (asi funcionaba antes del rediseño del 02-ago-2026).
 *
 * §6.2  Ri = Mi / (C+D) x 100                    [fraccion OVER_5MM]
 * §6.3  Ri = (C x Mi) / (C' x (C+D)) x 100        [fraccion UNDER_5MM]
 *
 * Si faltan C o D (o son 0), no se puede aplicar ninguna de las dos
 * formulas -- en ese caso se devuelve percentRetained en 0 para esos
 * tamices y se deja constancia explicita en calcNotes, en vez de
 * calcular con una formula incorrecta o dividir por cero.
 */
export function calculateGranulometry(
  sievesInput: GranulometrySieveInput[],
  totalDryMass: number,
  balance: GranulometryMassBalanceInput
): GranulometryCalcResult {
  const sieves = [...sievesInput].sort((a, b) => a.order - b.order);

  const C = balance.massUnder5mm_C;
  const D = balance.massOver5mm_D;
  const Cprime = balance.massUnder5mm_Cprime;

  const hasCD = C !== null && D !== null && C + D > 0;
  const denomOver = hasCD ? (C as number) + (D as number) : null;
  const denomUnder = hasCD && Cprime !== null && Cprime > 0 ? (Cprime as number) * (denomOver as number) : null;

  const missingBalanceNotes: string[] = [];
  if (!hasCD) {
    missingBalanceNotes.push(
      "No se pudo calcular %retenido/%pasa: faltan C (masa bajo 5mm) y/o D (masa sobre 5mm) en la cabecera del ensayo."
    );
  } else if (denomUnder === null && sieves.some((s) => s.fraction === "UNDER_5MM")) {
    missingBalanceNotes.push(
      "No se pudo calcular %retenido/%pasa de la serie fina: falta C' (masa de la submuestra cuarteada bajo 5mm)."
    );
  }

  let cumulative = 0;
  const computed: GranulometryCalculatedSieve[] = sieves.map((s) => {
    let ri: number | null = null;
    if (s.fraction === "OVER_5MM" && denomOver !== null) {
      ri = (s.retainedMass / denomOver) * 100;
    } else if (s.fraction === "UNDER_5MM" && denomUnder !== null && C !== null) {
      ri = ((C * s.retainedMass) / denomUnder) * 100;
    }

    if (ri === null) {
      // No se puede calcular: se registra 0 para no romper el acumulado,
      // pero el hueco queda explicado en calcNotes (missingBalanceNotes).
      return { order: s.order, percentRetained: 0, percentPassing: safePct(100 - cumulative) };
    }

    cumulative += ri;
    const pp = 100 - cumulative;
    return {
      order: s.order,
      percentRetained: safePct(ri),
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
  const fractionQa = evaluateFractionMassBalance(sievesInput, balance);

  const notesParts: string[] = [
    "%retenido/%pasa segun formulas MOP 8.102.1 §6.2 (sobre 5mm) y §6.3 (bajo 5mm).",
  ];
  if (errorPercent !== null) {
    notesParts.push(`Chequeo Z vs suma total = ${errorPercent.toFixed(2)}%.`);
  }
  if (fractionQa.errorPercentOver5mm !== null) {
    notesParts.push(`Cierre sobre 5mm (D') = ${fractionQa.errorPercentOver5mm.toFixed(2)}% (tol. ±0,5%).`);
  }
  if (fractionQa.errorPercentUnder5mm !== null) {
    notesParts.push(`Cierre bajo 5mm (C'') = ${fractionQa.errorPercentUnder5mm.toFixed(2)}% (tol. ±3%).`);
  }
  notesParts.push(...missingBalanceNotes);

  return {
    sieves: computed,
    d10: d10 !== null ? round3(d10) : null,
    d30: d30 !== null ? round3(d30) : null,
    d60: d60 !== null ? round3(d60) : null,
    cu: cu !== null ? round3(cu) : null,
    cc: cc !== null ? round3(cc) : null,
    errorPercent,
    fractionQa,
    calcNotes: notesParts.join(" "),
  };
}
