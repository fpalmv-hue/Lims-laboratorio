export interface GranulometrySieveInput {
  order: number;
  sieveLabel: string;
  openingMm: number | null;
  retainedMass: number; // g
}

export interface GranulometrySieveCalc extends GranulometrySieveInput {
  percentRetained: number;
  percentPassing: number;
}

export interface MopSoilQaResult {
  errorPercentGlobal: number;

  // MOP: tolerancias típicas por fracción (sobre y bajo tamiz de corte)
  errorPercentOverNo4?: number;   // fracción sobre N°4 (≈ 0,5%)
  errorPercentUnderNo4?: number;  // fracción bajo N°4 (≈ 3%)

  flags: {
    missingNo4: boolean;
    missingNo200: boolean;
    nonStandardSievesPresent: boolean;
  };

  messages: string[];
}
