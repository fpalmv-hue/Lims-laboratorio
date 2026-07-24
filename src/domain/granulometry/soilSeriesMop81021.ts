//⚠️ AUDITORÍA 24-jul-2026: ESTE ARCHIVO NO ESTÁ CONECTADO A NINGÚN CONTROLLER NI RUTA. // Es código huérfano (probablemente un intento anterior de motor de cálculo). // El motor real y en uso hoy es src/utils/granulometryCalc.ts (importado por // granulometry.controller.ts). NO lo importes en código nuevo sin antes // confirmar con el equipo — algunos valores aquí (ej. tolerancia N°4 en // 4.75mm) contradicen el criterio MOP 8.102.1 (N°4 = 5mm) ya corregido en // granulometryCalc.ts. Ver PROJECT_BRIEF.md sección 4.
// Serie de tamices elegidos - MOP 8.102.1 (Tabla 8.102.1.A)
// Suelos: 80, 63, 50, 40, 25, 20, 10, 5, 2, 0.5, 0.08 mm (+ Fondo)

export type SoilSieveKey =
  | "3in"
  | "2_1_2in"
  | "2in"
  | "1_1_2in"
  | "1in"
  | "3_4in"
  | "3_8in"
  | "No4"
  | "No10"
  | "No40"
  | "No200"
  | "Pan";

export interface SoilSieveDef {
  key: SoilSieveKey;
  sieveLabel: string;      // lo que muestras
  openingMm: number | null; // null para Fondo
  order: number;
  // flags de “tamiz clave”
  isNo4?: boolean;
  isNo200?: boolean;
}

export const SOIL_SERIES_MOP_81021: SoilSieveDef[] = [
  { key: "3in",      sieveLabel: '3"',    openingMm: 80,   order: 0 },
  { key: "2_1_2in",  sieveLabel: '2 1/2"',openingMm: 63,   order: 1 },
  { key: "2in",      sieveLabel: '2"',    openingMm: 50,   order: 2 },
  { key: "1_1_2in",  sieveLabel: '1 1/2"',openingMm: 40,   order: 3 },
  { key: "1in",      sieveLabel: '1"',    openingMm: 25,   order: 4 },
  { key: "3_4in",    sieveLabel: '3/4"',  openingMm: 20,   order: 5 },
  { key: "3_8in",    sieveLabel: '3/8"',  openingMm: 10,   order: 6 },
  { key: "No4",      sieveLabel: "N°4",   openingMm: 5,    order: 7, isNo4: true },
  { key: "No10",     sieveLabel: "N°10",  openingMm: 2,    order: 8 },
  { key: "No40",     sieveLabel: "N°40",  openingMm: 0.5,  order: 9 },
  { key: "No200",    sieveLabel: "N°200", openingMm: 0.08, order: 10, isNo200: true },
  { key: "Pan",      sieveLabel: "Fondo", openingMm: null, order: 11 },
];

// Para comparar flotantes sin volverte loco (0.5 vs 0,5 etc.)
export function mmEq(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
