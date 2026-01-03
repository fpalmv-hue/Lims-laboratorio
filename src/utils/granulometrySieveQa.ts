// src/utils/granulometrySieveQa.ts
// QA estructural (serie, orden, monotonicidad, presencia de tamices clave)
// No calcula masas; SOLO valida estructura y cobertura normativa.

export type SieveQaFlags = {
  duplicateOrder: boolean;
  fondoNotLast: boolean;
  nonMonotonicOpenings: boolean;
  missingNo4: boolean;
  missingNo10: boolean;
  missingNo40: boolean;
  missingNo200: boolean;
  missingFineSeries: boolean;
};

export type SieveQaResult = {
  status: "OK" | "WARNING";
  flags: SieveQaFlags;
  messages: string[];
};

type S = { order: number; sieveLabel: string; openingMm: number | null };

const mmEq = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

export function qaSieveStructure(sieves: S[]): SieveQaResult {
  const flags: SieveQaFlags = {
    duplicateOrder: false,
    fondoNotLast: false,
    nonMonotonicOpenings: false,
    missingNo4: false,
    missingNo10: false,
    missingNo40: false,
    missingNo200: false,
    missingFineSeries: false,
  };

  const messages: string[] = [];

  // Duplicate order
  const orders = new Set<number>();
  for (const s of sieves) {
    if (orders.has(s.order)) flags.duplicateOrder = true;
    orders.add(s.order);
  }
  if (flags.duplicateOrder) messages.push("QA: órdenes de tamiz duplicados.");

  // Fondo al final
  const fondoIdx = sieves.findIndex((s) => s.openingMm === null);
  if (fondoIdx !== -1 && fondoIdx !== sieves.length - 1) {
    flags.fondoNotLast = true;
    messages.push("QA: el Fondo debe ser el último registro.");
  }

  // Monotonicidad (aberturas decrecientes)
  let prev: number | null = null;
  for (const s of sieves) {
    if (s.openingMm === null) break;
    if (prev !== null && s.openingMm > prev + 1e-6) {
      flags.nonMonotonicOpenings = true;
      break;
    }
    prev = s.openingMm;
  }
  if (flags.nonMonotonicOpenings) {
    messages.push("QA: aberturas no monotónicas (deben decrecer).");
  }

  // Presencia de tamices clave (MOP 8.102.1 Tabla 8.102.1.A)
  const has = (mm: number) => sieves.some((s) => typeof s.openingMm === "number" && mmEq(s.openingMm!, mm));
  if (!has(4.75) && !has(5.0)) flags.missingNo4 = true; // No.4 ~ 4.75/5.0
  if (!has(2.0)) flags.missingNo10 = true;
  if (!has(0.5)) flags.missingNo40 = true;
  if (!has(0.08) && !has(0.075)) flags.missingNo200 = true;

  if (flags.missingNo4) messages.push("QA: falta tamiz No.4 (≈4,75–5,0 mm).");
  if (flags.missingNo10) messages.push("QA: falta tamiz No.10 (2,0 mm).");
  if (flags.missingNo40) messages.push("QA: falta tamiz No.40 (0,5 mm).");
  if (flags.missingNo200) messages.push("QA: falta tamiz No.200 (0,08/0,075 mm).");

  flags.missingFineSeries = flags.missingNo10 || flags.missingNo40 || flags.missingNo200;
  if (flags.missingFineSeries) {
    messages.push("QA: serie fina incompleta (#10/#40/#200). USCS y finos pueden quedar incompletos.");
  }

  const status: "OK" | "WARNING" = messages.length ? "WARNING" : "OK";
  return { status, flags, messages };
}
