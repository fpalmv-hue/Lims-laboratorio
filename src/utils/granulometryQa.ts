//⚠️ AUDITORÍA 24-jul-2026: ESTE ARCHIVO NO ESTÁ CONECTADO A NINGÚN CONTROLLER NI RUTA. // Es código huérfano (probablemente un intento anterior de motor de cálculo). // El motor real y en uso hoy es src/utils/granulometryCalc.ts (importado por // granulometry.controller.ts). NO lo importes en código nuevo sin antes // confirmar con el equipo — algunos valores aquí (ej. tolerancia N°4 en // 4.75mm) contradicen el criterio MOP 8.102.1 (N°4 = 5mm) ya corregido en // granulometryCalc.ts. Ver PROJECT_BRIEF.md sección 4.
// src/utils/granulometryQa.ts
// QA estructural para granulometría de suelos (LIMS / ISO 17025).
// No evalúa cierre de masa por fracción (eso lo hacemos en el siguiente bloque).
// Evalúa:
// - Presencia de tamices normativos (#4 y #200)
// - Serie fina (#10, #40, #200) cuando corresponda
// - Fondo al final
// - Aberturas decrecientes por order (cuando hay openingMm)
// - Duplicados (order / label normativo)
// - Etiquetas conocidas (No.4, No.10, No.40, No.200, Fondo)

export type QaStatus = "OK" | "WARNING" | "NO_CONFORME";

export interface QaSieveInput {
  order: number;
  sieveLabel: string;
  openingMm: number | null;
}

export interface GranulometryQaResult {
  status: QaStatus;
  classificationReady: boolean; // listo para USCS preliminar por granulometría
  flags: {
    missingNo4: boolean;
    missingNo10: boolean;
    missingNo40: boolean;
    missingNo200: boolean;
    fondoNotLast: boolean;
    nonMonotonicOpenings: boolean;
    duplicateOrder: boolean;
    duplicateKeySieve: boolean; // duplicado de #4/#10/#40/#200/fondo
    missingFineSeries: boolean; // si solo hay fracción gruesa sin #10/#40/#200
  };
  messages: string[]; // trazabilidad (para calcNotes)
}

// Normaliza etiquetas: "N°4", "No.4", "#4", "4" => "#4"
function normalizeLabel(raw: string): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace("Nº", "N°");

  if (!s) return "";

  // Fondo / Residuo
  if (s.includes("FONDO") || s.includes("RESID")) return "FONDO";

  // Formas de "No.x" / "N°x" / "#x"
  // Extrae números si hay
  const m = s.match(/(#|N°|NO\.?|N)\s*(\d+)/);
  if (m && m[2]) return `#${m[2]}`;

  // Si viene como "200" a secas
  if (/^\d+$/.test(s)) return `#${s}`;

  // pulgadas 3/4", 1/2", etc. (no las convertimos aquí)
  return s;
}

function hasKey(sieves: QaSieveInput[], key: "#4" | "#10" | "#40" | "#200" | "FONDO"): boolean {
  return sieves.some(s => normalizeLabel(s.sieveLabel) === key);
}

function findFondoIndex(sieves: QaSieveInput[]): number {
  return sieves.findIndex(s => normalizeLabel(s.sieveLabel) === "FONDO");
}

function detectFinePresence(sieves: QaSieveInput[]): boolean {
  // Si aparece cualquier tamiz fino clave por label, o opening menor/igual a 2.0 (aprox #10),
  // asumimos que el ensayo incluye fracción fina.
  if (hasKey(sieves, "#10") || hasKey(sieves, "#40") || hasKey(sieves, "#200")) return true;
  return sieves.some(s => typeof s.openingMm === "number" && s.openingMm !== null && s.openingMm <= 2.0);
}

function checkMonotonicOpeningsByOrder(sorted: QaSieveInput[]): boolean {
  // Permite null (Fondo u otros). Solo evalúa donde hay openingMm.
  let prev: number | null = null;
  for (const s of sorted) {
    if (s.openingMm === null || s.openingMm === undefined) continue;
    if (prev === null) {
      prev = s.openingMm;
      continue;
    }
    // Debe ir decreciendo (de grueso a fino) cuando order aumenta
    if (s.openingMm > prev + 1e-9) return false;
    prev = s.openingMm;
  }
  return true;
}

function hasDuplicateOrder(sieves: QaSieveInput[]): boolean {
  const seen = new Set<number>();
  for (const s of sieves) {
    if (!Number.isFinite(s.order)) return true; // order inválido lo tratamos como duplicado/estructura rota
    if (seen.has(s.order)) return true;
    seen.add(s.order);
  }
  return false;
}

function hasDuplicateKeySieve(sieves: QaSieveInput[]): boolean {
  const keys = new Set<string>();
  const keySet = new Set(["#4", "#10", "#40", "#200", "FONDO"]);
  for (const s of sieves) {
    const k = normalizeLabel(s.sieveLabel);
    if (!keySet.has(k)) continue;
    if (keys.has(k)) return true;
    keys.add(k);
  }
  return false;
}

export function evaluateGranulometryQa(sievesInput: QaSieveInput[]): GranulometryQaResult {
  const sieves = (sievesInput ?? []).map(s => ({
    order: Number(s.order),
    sieveLabel: String(s.sieveLabel ?? ""),
    openingMm: s.openingMm === null || s.openingMm === undefined ? null : Number(s.openingMm),
  }));

  const messages: string[] = [];

  const duplicateOrder = hasDuplicateOrder(sieves);
  if (duplicateOrder) messages.push("QA: Estructura inválida: 'order' duplicado o no numérico.");

  const duplicateKeySieve = hasDuplicateKeySieve(sieves);
  if (duplicateKeySieve) messages.push("QA: Estructura inválida: tamiz clave duplicado (#4/#10/#40/#200/Fondo).");

  const sorted = [...sieves].sort((a, b) => a.order - b.order);

  const fondoIdx = findFondoIndex(sorted);
  const fondoNotLast = fondoIdx !== -1 && fondoIdx !== sorted.length - 1;
  if (fondoNotLast) messages.push("QA: 'Fondo/Residuo' debe ser el último registro (orden mayor).");

  const nonMonotonicOpenings = !checkMonotonicOpeningsByOrder(sorted);
  if (nonMonotonicOpenings) messages.push("QA: Aberturas (openingMm) no decrecen según el orden de tamices.");

  // Reglas de presencia
  const missingNo4 = !hasKey(sieves, "#4");
  if (missingNo4) messages.push("QA: Falta tamiz No.4 (#4 = 4,75 mm). Recomendado/clave para separar fracción gruesa-fina.");

  const finePresent = detectFinePresence(sieves);

  // Serie fina: #10 #40 #200
  const missingNo10 = finePresent && !hasKey(sieves, "#10");
  if (missingNo10) messages.push("QA: Falta tamiz No.10 (#10 ≈ 2,00 mm) en fracción fina.");

  const missingNo40 = finePresent && !hasKey(sieves, "#40");
  if (missingNo40) messages.push("QA: Falta tamiz No.40 (#40 ≈ 0,425 mm) en fracción fina.");

  const missingNo200 = !hasKey(sieves, "#200");
  if (missingNo200) messages.push("QA: Falta tamiz No.200 (#200 = 0,08/0,075 mm). Sin él no se puede clasificar USCS por granulometría.");

  // Si no hay ningún tamiz fino clave, marcamos “missingFineSeries” (no es error, solo aviso)
  const missingFineSeries = !hasKey(sieves, "#10") && !hasKey(sieves, "#40") && !hasKey(sieves, "#200");
  if (missingFineSeries) messages.push("QA: Ensayo sin serie fina (#10/#40/#200). Se permite, pero USCS y análisis de finos pueden quedar incompletos.");

  // Status
  // - NO_CONFORME solo para estructura rota (duplicados/orden imposible)
  // - WARNING para faltantes normativos/serie o inconsistencias corregibles
  let status: QaStatus = "OK";

  if (duplicateOrder || duplicateKeySieve) status = "NO_CONFORME";
  else if (fondoNotLast || nonMonotonicOpenings || missingNo200 || missingNo4 || (finePresent && (missingNo10 || missingNo40))) {
    status = "WARNING";
  }

  // Clasificación USCS preliminar requiere #200 y #4 y estructura no conforme NO
  const classificationReady = status !== "NO_CONFORME" && !missingNo200 && !missingNo4;

  return {
    status,
    classificationReady,
    flags: {
      missingNo4,
      missingNo10,
      missingNo40,
      missingNo200,
      fondoNotLast,
      nonMonotonicOpenings,
      duplicateOrder,
      duplicateKeySieve,
      missingFineSeries,
    },
    messages,
  };
}
