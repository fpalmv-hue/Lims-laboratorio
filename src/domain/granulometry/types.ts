//⚠️ AUDITORÍA 24-jul-2026: ESTE ARCHIVO NO ESTÁ CONECTADO A NINGÚN CONTROLLER NI RUTA. // Es código huérfano (probablemente un intento anterior de motor de cálculo). // El motor real y en uso hoy es src/utils/granulometryCalc.ts (importado por // granulometry.controller.ts). NO lo importes en código nuevo sin antes // confirmar con el equipo — algunos valores aquí (ej. tolerancia N°4 en // 4.75mm) contradicen el criterio MOP 8.102.1 (N°4 = 5mm) ya corregido en // granulometryCalc.ts. Ver PROJECT_BRIEF.md sección 4.
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
