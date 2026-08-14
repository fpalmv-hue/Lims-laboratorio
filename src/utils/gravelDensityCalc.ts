// src/utils/gravelDensityCalc.ts
//
// Densidad Neta / Real de Gravas -- NCh1117.Of2010 ("Aridos para
// morteros y hormigones - Determinacion de las densidades reales y neta
// y de la absorcion de agua de las gravas").
//
// Simbolos identicos a la norma para poder auditar linea a linea:
//   A = masa sumergida (SSS menos la masa del agua desplazada)
//   B = masa del arido saturado superficialmente seco (SSS), al aire
//   C = masa del arido seco al horno, al aire
//   ρRsss = densidad real del arido SSS
//   ρRS   = densidad real del arido seco
//   ρN    = densidad neta
//
// La norma exige "muestras gemelas" (dos determinaciones A/B/C
// independientes) con tolerancia bloqueante entre ellas (10.3.1): si se
// excede, no se calcula resultado final -- hay que ensayar dos muestras
// gemelas nuevas.

export const DENSITY_DIFF_TOLERANCE_KGM3 = 30;
export const ABSORPTION_DIFF_TOLERANCE_PERCENT = 0.3;

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export type GravelDensityDetermination = {
  realSssDensityKgm3: number; // ρRsss = B/(B-A) * 1000
  realDryDensityKgm3: number; // ρRS = C/(B-A) * 1000
  netDensityKgm3: number; // ρN = C/(C-A) * 1000
  absorptionPercent: number; // (B-C)/C * 100
};

/**
 * Calcula ρRsss, ρRS, ρN y absorcion para UNA determinacion (A,B,C).
 * A/B/C pueden estar en cualquier unidad de masa consistente (g o kg):
 * las formulas son razones adimensionales * 1000, el resultado da en
 * kg/m3 asumiendo densidad del agua = 1000 kg/m3 (norma, nota bajo 10).
 * Aproximado a 1 kg/m3 (densidades) y 0.1% (absorcion), norma 10.1/10.2.
 */
export function computeGravelDensityDetermination(params: {
  aG: number;
  bG: number;
  cG: number;
}): GravelDensityDetermination | { error: string } {
  const { aG: A, bG: B, cG: C } = params;

  const denomReal = B - A;
  const denomNeta = C - A;
  if (denomReal <= 0 || denomNeta <= 0) {
    return { error: "(B - A) y (C - A) deben ser positivos -- revisar las masas ingresadas." };
  }

  return {
    realSssDensityKgm3: roundTo((B / denomReal) * 1000, 0),
    realDryDensityKgm3: roundTo((C / denomReal) * 1000, 0),
    netDensityKgm3: roundTo((C / denomNeta) * 1000, 0),
    absorptionPercent: roundTo(((B - C) / C) * 100, 1),
  };
}

export type GravelDensityCalcResult = {
  det1: GravelDensityDetermination | null;
  det2: GravelDensityDetermination | null;
  diffs: {
    realSssDensityDiffKgm3: number | null;
    realDryDensityDiffKgm3: number | null;
    netDensityDiffKgm3: number | null;
    absorptionDiffPercent: number | null;
  };
  final: {
    realSssDensityKgm3: number | null;
    realDryDensityKgm3: number | null;
    netDensityKgm3: number | null;
    absorptionPercent: number | null;
  };
  error: string | null;
};

/**
 * Calcula el resultado completo a partir de dos muestras gemelas.
 * Si cualquiera de las diferencias excede la tolerancia (10.3.1: 30
 * kg/m3 en densidades, 0.3% en absorcion), retorna error y no calcula
 * el resultado final -- hay que ensayar dos muestras gemelas nuevas.
 */
export function computeGravelDensityFromTwins(params: {
  aG1: number;
  bG1: number;
  cG1: number;
  aG2: number;
  bG2: number;
  cG2: number;
}): GravelDensityCalcResult {
  const empty: GravelDensityCalcResult = {
    det1: null,
    det2: null,
    diffs: {
      realSssDensityDiffKgm3: null,
      realDryDensityDiffKgm3: null,
      netDensityDiffKgm3: null,
      absorptionDiffPercent: null,
    },
    final: {
      realSssDensityKgm3: null,
      realDryDensityKgm3: null,
      netDensityKgm3: null,
      absorptionPercent: null,
    },
    error: null,
  };

  const det1 = computeGravelDensityDetermination({ aG: params.aG1, bG: params.bG1, cG: params.cG1 });
  if ("error" in det1) return { ...empty, error: `Muestra gemela 1: ${det1.error}` };

  const det2 = computeGravelDensityDetermination({ aG: params.aG2, bG: params.bG2, cG: params.cG2 });
  if ("error" in det2) return { ...empty, error: `Muestra gemela 2: ${det2.error}` };

  const realSssDensityDiffKgm3 = roundTo(Math.abs(det1.realSssDensityKgm3 - det2.realSssDensityKgm3), 1);
  const realDryDensityDiffKgm3 = roundTo(Math.abs(det1.realDryDensityKgm3 - det2.realDryDensityKgm3), 1);
  const netDensityDiffKgm3 = roundTo(Math.abs(det1.netDensityKgm3 - det2.netDensityKgm3), 1);
  const absorptionDiffPercent = roundTo(Math.abs(det1.absorptionPercent - det2.absorptionPercent), 2);

  const diffs = {
    realSssDensityDiffKgm3,
    realDryDensityDiffKgm3,
    netDensityDiffKgm3,
    absorptionDiffPercent,
  };

  const densityIssues: string[] = [];
  if (realSssDensityDiffKgm3 > DENSITY_DIFF_TOLERANCE_KGM3) {
    densityIssues.push(`ρRsss difiere ${realSssDensityDiffKgm3} kg/m³`);
  }
  if (realDryDensityDiffKgm3 > DENSITY_DIFF_TOLERANCE_KGM3) {
    densityIssues.push(`ρRS difiere ${realDryDensityDiffKgm3} kg/m³`);
  }
  if (netDensityDiffKgm3 > DENSITY_DIFF_TOLERANCE_KGM3) {
    densityIssues.push(`ρN difiere ${netDensityDiffKgm3} kg/m³`);
  }
  const absorptionIssue = absorptionDiffPercent > ABSORPTION_DIFF_TOLERANCE_PERCENT;

  if (densityIssues.length > 0 || absorptionIssue) {
    const parts: string[] = [];
    if (densityIssues.length > 0) {
      parts.push(`${densityIssues.join(", ")} (tolerancia ${DENSITY_DIFF_TOLERANCE_KGM3} kg/m³)`);
    }
    if (absorptionIssue) {
      parts.push(
        `absorción difiere ${absorptionDiffPercent}% (tolerancia ${ABSORPTION_DIFF_TOLERANCE_PERCENT}%)`
      );
    }
    return {
      det1,
      det2,
      diffs,
      final: empty.final,
      error: `Las muestras gemelas no cumplen la tolerancia de NCh1117.Of2010 (10.3.1): ${parts.join(
        "; "
      )}. Debe ensayarse un nuevo par de muestras gemelas.`,
    };
  }

  const final = {
    realSssDensityKgm3: roundTo((det1.realSssDensityKgm3 + det2.realSssDensityKgm3) / 2, -1),
    realDryDensityKgm3: roundTo((det1.realDryDensityKgm3 + det2.realDryDensityKgm3) / 2, -1),
    netDensityKgm3: roundTo((det1.netDensityKgm3 + det2.netDensityKgm3) / 2, -1),
    absorptionPercent: roundTo((det1.absorptionPercent + det2.absorptionPercent) / 2, 1),
  };

  return { det1, det2, diffs, final, error: null };
}
