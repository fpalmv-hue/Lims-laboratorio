// src/utils/aggregateGranulometryCalc.ts
//
// Granulometria de Aridos -- NCh165.Of2009 ("Aridos para morteros y
// hormigones - Tamizado y determinacion de la granulometria"), unica
// norma citada por MOP 8.202.3 segun indico Felipe (el MC es una
// adaptacion de esta NCh, no un texto independiente).
//
// Serie preferida (Tabla 2, unica serie exigida como minimo, Nota 1):
// 75-37.5-19-9.5-4.75-2.36-1.18-0.600-0.300-0.150 mm. Serie complementaria
// (63-50-25-12.5mm) NO cargada en esta fase -- coincide numericamente con
// tamices YA existentes en el catalogo de Suelos, generaria abertura
// duplicada entre instrumentos fisicos de areas distintas (confirmado
// con Felipe).

export const PREFERRED_SERIES_MM = [75, 37.5, 19, 9.5, 4.75, 2.36, 1.18, 0.6, 0.3, 0.15];

// Indice de 4,75mm dentro de la serie preferida -- clave para clasificar
// fino/grueso (cl. 3.1/3.2) y para el modulo de finura (Anexo A.2.1.x).
const IDX_4_75MM = PREFERRED_SERIES_MM.indexOf(4.75);
// Indice de 2,36mm -- clave para el umbral reducido de Tabla 3 (masa
// minima arido fino).
const IDX_2_36MM = PREFERRED_SERIES_MM.indexOf(2.36);

const EPS_MM = 1e-6;

export const BALANCE_TOLERANCE_FINO_PERCENT = 1;
export const BALANCE_TOLERANCE_GRUESO_PERCENT = 0.5;
// MEZCLADO: la norma no da un numero propio de tolerancia en el resumen
// disponible para este trabajo -- se usa la de GRUESO (0.5%) porque
// MEZCLADO comparte la misma via de calculo de modulo de finura que
// GRUESO (A.2.2/A.2.3, Anexo A). Interpretacion propia, NO confirmada
// linea a linea contra el texto completo de la norma -- ajustar si
// Felipe confirma un valor distinto.
export const BALANCE_TOLERANCE_MEZCLADO_PERCENT = BALANCE_TOLERANCE_GRUESO_PERCENT;

// Umbral de inconsistencia entre tipoArido declarado y las masas reales
// (cl. 8.1.2 para FINO, 8.2.2 para GRUESO). Fraccion mixta >15% NO
// soportada en esta fase (separacion real, trabajo normativo aparte) --
// se detecta y rechaza, no se calcula silenciosamente mal.
export const MIXED_FRACTION_THRESHOLD_PERCENT = 15;

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export type AggregateTypeLabel = "FINO" | "GRUESO" | "MEZCLADO";

export type AggregateSieveInput = {
  openingMm: number;
  retainedMass: number;
  nominalLabel?: string | null;
};

// ---------------------------------------------------------------------
// Normalizacion: exige EXACTAMENTE los 10 tamices de la serie preferida,
// sin faltantes ni sobrantes ni duplicados. Devuelve ordenado descendente
// por abertura (coincide con el orden de PREFERRED_SERIES_MM).
// ---------------------------------------------------------------------
export function normalizeAggregateSieves(
  sieves: AggregateSieveInput[]
): { sieves: AggregateSieveInput[]; error: string | null } {
  if (!Array.isArray(sieves) || sieves.length !== PREFERRED_SERIES_MM.length) {
    return {
      sieves: [],
      error: `sieves debe tener exactamente ${PREFERRED_SERIES_MM.length} elementos (serie preferida NCh165 Tabla 2: ${PREFERRED_SERIES_MM.join(", ")} mm).`,
    };
  }

  const matched: (AggregateSieveInput | null)[] = PREFERRED_SERIES_MM.map(() => null);

  for (const raw of sieves) {
    const opening = Number(raw.openingMm);
    const mass = Number(raw.retainedMass);
    if (!Number.isFinite(opening)) {
      return { sieves: [], error: `openingMm invalido: ${raw.openingMm}` };
    }
    if (!Number.isFinite(mass) || mass < 0) {
      return { sieves: [], error: `retainedMass invalido para tamiz ${opening}mm (debe ser numerico >= 0).` };
    }
    const idx = PREFERRED_SERIES_MM.findIndex((mm) => Math.abs(mm - opening) < EPS_MM);
    if (idx === -1) {
      return {
        sieves: [],
        error: `Abertura ${opening}mm no pertenece a la serie preferida NCh165 Tabla 2 (${PREFERRED_SERIES_MM.join(", ")} mm). La serie complementaria no esta cargada en esta fase.`,
      };
    }
    if (matched[idx] !== null) {
      return { sieves: [], error: `Tamiz ${opening}mm duplicado en la solicitud.` };
    }
    matched[idx] = { openingMm: PREFERRED_SERIES_MM[idx], retainedMass: mass, nominalLabel: raw.nominalLabel ?? null };
  }

  const missing = matched
    .map((m, i) => (m === null ? PREFERRED_SERIES_MM[i] : null))
    .filter((v): v is number => v !== null);
  if (missing.length > 0) {
    return { sieves: [], error: `Falta(n) tamiz(ces) de la serie preferida: ${missing.join(", ")} mm.` };
  }

  return { sieves: matched as AggregateSieveInput[], error: null };
}

// ---------------------------------------------------------------------
// Balance de masa, cl. 10.1/10.2. BLOQUEANTE: si no cumple, el llamador
// debe rechazar la creacion sin persistir nada (mismo patron que
// GravelDensity/NCh1117 10.3.1 -- NO el qaStatus persistido-aunque-falle
// de Granulometry de Suelos, que es una regla normativa distinta).
// ---------------------------------------------------------------------
export type BalanceResult = {
  sumaFracciones: number;
  diferenciaPercent: number;
  toleranciaPercent: number;
  ok: boolean;
};

export function computeMassBalance(params: {
  sieves: AggregateSieveInput[];
  masaDeposito: number;
  masaInicialSeca: number;
  tipoArido: AggregateTypeLabel;
}): BalanceResult {
  const sumaFracciones = params.sieves.reduce((acc, s) => acc + s.retainedMass, 0) + params.masaDeposito;
  const diferenciaPercent = round(
    (Math.abs(sumaFracciones - params.masaInicialSeca) / params.masaInicialSeca) * 100,
    3
  );
  const toleranciaPercent =
    params.tipoArido === "FINO"
      ? BALANCE_TOLERANCE_FINO_PERCENT
      : params.tipoArido === "GRUESO"
      ? BALANCE_TOLERANCE_GRUESO_PERCENT
      : BALANCE_TOLERANCE_MEZCLADO_PERCENT;

  return {
    sumaFracciones: round(sumaFracciones, 3),
    diferenciaPercent,
    toleranciaPercent,
    ok: diferenciaPercent <= toleranciaPercent,
  };
}

// ---------------------------------------------------------------------
// % parcial/acumulado retenido y % que pasa (cl. 3.7/3.8/3.9, 10.3/10.4).
// % parcial APROXIMADO AL 1% -- exigencia normativa explicita de 10.3,
// no cosmetica. El acumulado se arma sumando los parciales YA
// REDONDEADOS (asi lo define la norma: acumulado = parcial de ese
// tamiz + suma de parciales de los tamices de mayor abertura), no
// redondeando el acumulado de forma independiente.
// ---------------------------------------------------------------------
export type AggregateSieveResult = {
  order: number;
  openingMm: number;
  nominalLabel: string | null;
  retainedMass: number;
  percentRetained: number;
  percentAccumRetained: number;
  percentPassing: number;
};

export function computeSievePercentages(
  sieves: AggregateSieveInput[],
  sumaFracciones: number
): AggregateSieveResult[] {
  const results: AggregateSieveResult[] = [];
  let accum = 0;
  sieves.forEach((s, i) => {
    const percentRetained = sumaFracciones > 0 ? Math.round((s.retainedMass / sumaFracciones) * 100) : 0;
    accum += percentRetained;
    results.push({
      order: i + 1,
      openingMm: s.openingMm,
      nominalLabel: s.nominalLabel ?? null,
      retainedMass: s.retainedMass,
      percentRetained,
      percentAccumRetained: accum,
      percentPassing: 100 - accum,
    });
  });
  return results;
}

// ---------------------------------------------------------------------
// Deteccion de fraccion mixta inconsistente con lo declarado (cl.
// 8.1.2/8.2.2). NO se implementa la separacion (trabajo normativo
// aparte, fuera de alcance de esta fase) -- se detecta y rechaza con
// mensaje explicito, mismo patron de rechazo duro que el balance de
// masa. MEZCLADO no se chequea aca (es la clasificacion que ya asume
// ambas fracciones a proposito).
// ---------------------------------------------------------------------
export type MixedFractionCheckResult = { ok: boolean; error: string | null };

export function checkMixedFractionConsistency(
  results: AggregateSieveResult[],
  tipoArido: AggregateTypeLabel
): MixedFractionCheckResult {
  const r475 = results[IDX_4_75MM];

  if (tipoArido === "FINO") {
    const retainedAt475 = r475.percentAccumRetained;
    if (retainedAt475 > MIXED_FRACTION_THRESHOLD_PERCENT) {
      return {
        ok: false,
        error: `Muestra declarada FINO pero tiene ${retainedAt475}% retenido acumulado en tamiz 4,75mm (> ${MIXED_FRACTION_THRESHOLD_PERCENT}%, cl. 8.1.2). Es una fraccion mixta -- registrar como dos ensayos separados (uno FINO, uno GRUESO) hasta que se implemente soporte nativo de separacion.`,
      };
    }
  }

  if (tipoArido === "GRUESO") {
    const passingAt475 = r475.percentPassing;
    if (passingAt475 > MIXED_FRACTION_THRESHOLD_PERCENT) {
      return {
        ok: false,
        error: `Muestra declarada GRUESO pero tiene ${passingAt475}% pasante en tamiz 4,75mm (> ${MIXED_FRACTION_THRESHOLD_PERCENT}%, cl. 8.2.2). Es una fraccion mixta -- registrar como dos ensayos separados (uno FINO, uno GRUESO) hasta que se implemente soporte nativo de separacion.`,
      };
    }
  }

  return { ok: true, error: null };
}

// ---------------------------------------------------------------------
// Modulo de finura (Anexo A, informativo pero exigido en el informe por
// 10.6). Tres casos:
//   A.2.1.1 -- arido fino, pasa 100% en tamiz 4,75mm.
//   A.2.1.2 -- arido fino, NO pasa 100% en 4,75mm (modulo de finura
//              especifico de la fraccion fina contenida).
//   A.2.2/A.2.3 -- arido grueso O mezclado (misma via de calculo,
//              desde el menor tamiz que deja pasar 100% hasta 0,150mm,
//              incluyendo tamices con 0% aunque no aporten).
//
// Cada caso se calcula por DOS caminos (suma de %acumulado retenido, y
// su equivalente algebraico via %acumulado que pasa) como verificacion
// cruzada -- deben coincidir siempre por identidad matematica
// (percentPassing = 100 - percentAccumRetained en cada tamiz), asi que
// checkAlt sirve como test de regresion de esta implementacion, no como
// dato normativo independiente.
//
// NOTA IMPORTANTE: esta implementacion sigue las formulas tal como las
// describio Felipe en el documento de trabajo, pero NO fue validada
// contra los ejemplos numericos oficiales del Anexo A (A.1/A.2 del PDF
// de la norma) porque ese PDF no esta disponible en este entorno -- solo
// se conocen los resultados finales esperados (MF=2.67 caso a, MF=2.91
// caso b fraccion fina, MF=8.65 arido grueso), no las masas retenidas
// por tamiz de esos ejemplos. Pendiente de validacion real.
// ---------------------------------------------------------------------
export type FinenessModulusCase = "A.2.1.1" | "A.2.1.2" | "A.2.2_A.2.3";

export type FinenessModulusResult = {
  moduloFinura: number;
  moduloFinuraCase: FinenessModulusCase;
  checkAlt: number;
};

export function computeFinenessModulus(
  results: AggregateSieveResult[],
  tipoArido: AggregateTypeLabel
): FinenessModulusResult {
  const r475 = results[IDX_4_75MM];

  if (tipoArido === "FINO") {
    const key6 = results.slice(IDX_4_75MM); // 4,75mm .. 0,150mm (6 tamices)

    if (r475.percentAccumRetained === 0) {
      // A.2.1.1
      const sumAccumRetained = key6.reduce((acc, s) => acc + s.percentAccumRetained, 0);
      const sumPassing = key6.reduce((acc, s) => acc + s.percentPassing, 0);
      return {
        moduloFinura: round(sumAccumRetained / 100, 2),
        moduloFinuraCase: "A.2.1.1",
        checkAlt: round(key6.length - sumPassing / 100, 2),
      };
    }

    // A.2.1.2 -- modulo de finura de la fraccion fina contenida
    const percentPassing475 = r475.percentPassing;
    const sumPassingKey6 = key6.reduce((acc, s) => acc + s.percentPassing, 0);
    const mf = 6 - sumPassingKey6 / percentPassing475;
    return { moduloFinura: round(mf, 2), moduloFinuraCase: "A.2.1.2", checkAlt: round(mf, 2) };
  }

  // GRUESO o MEZCLADO -- A.2.2/A.2.3
  let startIdx = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].percentAccumRetained === 0) startIdx = i;
    else break;
  }
  const considered = results.slice(startIdx);
  const sumAccumRetained = considered.reduce((acc, s) => acc + s.percentAccumRetained, 0);
  const sumPassing = considered.reduce((acc, s) => acc + s.percentPassing, 0);
  return {
    moduloFinura: round(sumAccumRetained / 100, 2),
    moduloFinuraCase: "A.2.2_A.2.3",
    checkAlt: round(considered.length - sumPassing / 100, 2),
  };
}

// ---------------------------------------------------------------------
// QA de tamaño de muestra (cl. 8, Tablas 3-4). NO bloqueante -- mismo
// patron persistido que evaluateFractionMassBalance de Granulometry de
// Suelos (qaStatus "OK"/"WARNING", nunca bloquea create).
//
// Tabla 4 (masa minima segun Dn, arido grueso): en el documento de
// trabajo solo se confirmaron 2 puntos (Dn=9,5mm->4kg, Dn=75mm->32kg),
// no la tabla completa. Para cualquier otro Dn no se evalua el chequeo
// (no se bloquea ni se inventa un numero) -- brecha real de DATOS, no
// de implementacion, senalada en el mensaje.
//
// Tabla 5 (masa maxima retenida por tamiz individual, segun area
// efectiva del marco) NO implementada -- requeriria un campo nuevo en
// Sieve, fuera de alcance de esta fase. Ver nota en CLAUDE.md.
// ---------------------------------------------------------------------
const FINE_MIN_MASS_STANDARD_G = 500;
const FINE_MIN_MASS_REDUCED_G = 100;
const COARSE_MIN_MASS_KG_BY_DN: Record<number, number> = {
  9.5: 4,
  75: 32,
};

export type SampleSizeQaResult = { qaStatus: "OK" | "WARNING"; messages: string[] };

export function evaluateSampleSizeQa(params: {
  tipoArido: AggregateTypeLabel;
  masaInicialSeca: number;
  tamañoMaximoNominalMm: number | null;
  results: AggregateSieveResult[];
}): SampleSizeQaResult {
  const messages: string[] = [];

  if (params.tipoArido === "FINO") {
    const retainedAt236 = params.results[IDX_2_36MM].percentAccumRetained;
    const reduced = retainedAt236 <= 5;
    const minMass = reduced ? FINE_MIN_MASS_REDUCED_G : FINE_MIN_MASS_STANDARD_G;
    if (params.masaInicialSeca < minMass) {
      messages.push(
        `QA: masa inicial seca (${params.masaInicialSeca}g) bajo el minimo de Tabla 3 (${minMass}g` +
          (reduced ? ", umbral reducido por <=5% retenido acumulado en tamiz 2,36mm" : "") +
          `).`
      );
    }
  }

  if (params.tipoArido === "GRUESO" || params.tipoArido === "MEZCLADO") {
    const dn = params.tamañoMaximoNominalMm;
    if (dn === null || dn === undefined) {
      messages.push("QA: falta tamañoMaximoNominal (Dn) -- no se pudo evaluar masa minima de Tabla 4.");
    } else {
      const minKg = COARSE_MIN_MASS_KG_BY_DN[dn];
      if (minKg === undefined) {
        messages.push(
          `QA: Tabla 4 (masa minima segun Dn) incompleta en este sistema -- solo se conocen los valores para Dn=9,5mm (4kg) y Dn=75mm (32kg). No se pudo evaluar para Dn=${dn}mm.`
        );
      } else if (params.masaInicialSeca < minKg * 1000) {
        messages.push(
          `QA: masa inicial seca (${params.masaInicialSeca}g) bajo el minimo de Tabla 4 para Dn=${dn}mm (${minKg}kg = ${minKg * 1000}g).`
        );
      }
    }
  }

  return { qaStatus: messages.length > 0 ? "WARNING" : "OK", messages };
}

// Nota fija de brecha conocida (Tabla 5), para que el llamador la
// concatene siempre en calcNotes -- no es una advertencia condicional a
// los datos del ensayo, es una limitacion del sistema.
export const TABLE_5_GAP_NOTE =
  "Nota: Tabla 5 (masa maxima retenida por tamiz individual, segun area efectiva del marco) no implementada en esta fase -- requeriria un campo de area efectiva en el catalogo de tamices (Sieve), fuera de alcance. Ver CLAUDE.md.";
