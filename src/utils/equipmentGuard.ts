// src/utils/equipmentGuard.ts
//
// Helper de vigencia de equipos (ISO 17025).
// Diseñado en Phase 2 del subsistema Equipment (14-ago-2026).
//
// Terminología (no confundir en mensajes de error):
//   Verificación: chequeo periódico INTERNO (NORMATIVE y PRECISION).
//   Calibración:  certificación externa acreditada (PRECISION y REFERENCE_STANDARD).
//
// Periodicidades confirmadas por Felipe — no asumir ninguna otra:
//   MOLD              verificación interna  3 meses
//   PYCNOMETER        verificación interna  6 meses
//   SAND_CONE depósito/cono  verificación  6 meses
//   SAND_CONE arena normalizada verificación 3 meses
//   SAND_CONE embudo  periodicidad AUN NO DEFINIDA — no se bloquea
//   SCALE/OVEN        verificación interna  6 meses | calibración externa 1 año
//   REFERENCE_WEIGHT/THERMOMETER  calibración externa 1 año
//
// No se conecta a controllers de ensayo todavía — Fase 3.
import prisma from "../prismaClient";

// ── Tipo interno que incluye todas las tablas de detalle necesarias ──
type EquipmentWithDetail = {
  id: number;
  code: string;
  category: string;
  type: string;
  status: string;
  calibrationDueAt: Date | null;
  verificationDueAt: Date | null;
  mold?: {
    verificationDueAt: Date | null;
  } | null;
  pycnometer?: {
    verificationDueAt: Date | null;
  } | null;
  sandCone?: {
    depositVerificationDueAt: Date | null;
    sandDensityVerificationDueAt: Date | null;
  } | null;
  sieve?: {
    verificationDueAt: Date | null;
    astmDesignation: string;
  } | null;
};

/**
 * Función pura: dado un Equipment con sus detalles ya cargados,
 * devuelve si está vigente y por qué no si no lo está.
 * No hace consultas a la BD — permite reusar la lógica en controllers
 * de listado sin generar N consultas adicionales.
 */
export function computeVigente(eq: EquipmentWithDetail): { vigente: boolean; motivo?: string } {
  if (eq.status !== "ACTIVE") {
    return { vigente: false, motivo: `Equipo ${eq.code} está fuera de servicio.` };
  }

  const now = new Date();

  if (eq.category === "REFERENCE_STANDARD") {
    if (!eq.calibrationDueAt || eq.calibrationDueAt < now) {
      return {
        vigente: false,
        motivo: `Equipo patrón ${eq.code}: calibración externa vencida o sin registrar.`,
      };
    }
    return { vigente: true };
  }

  if (eq.category === "PRECISION") {
    if (!eq.calibrationDueAt || eq.calibrationDueAt < now) {
      return {
        vigente: false,
        motivo: `Equipo ${eq.code}: calibración externa vencida o sin registrar.`,
      };
    }
    if (!eq.verificationDueAt || eq.verificationDueAt < now) {
      return {
        vigente: false,
        motivo: `Equipo ${eq.code}: verificación interna vencida o sin registrar (periodicidad 6 meses).`,
      };
    }
    return { vigente: true };
  }

  // NORMATIVE: la vigencia vive en la tabla de detalle
  if (eq.type === "MOLD") {
    if (!eq.mold?.verificationDueAt || eq.mold.verificationDueAt < now) {
      return {
        vigente: false,
        motivo: `Molde ${eq.code}: verificación interna vencida o sin registrar (periodicidad 3 meses).`,
      };
    }
    return { vigente: true };
  }

  if (eq.type === "PYCNOMETER") {
    if (!eq.pycnometer?.verificationDueAt || eq.pycnometer.verificationDueAt < now) {
      return {
        vigente: false,
        motivo: `Picnómetro ${eq.code}: verificación interna vencida o sin registrar (periodicidad 6 meses).`,
      };
    }
    return { vigente: true };
  }

  if (eq.type === "SIEVE") {
    if (!eq.sieve?.verificationDueAt || eq.sieve.verificationDueAt < now) {
      return {
        vigente: false,
        motivo: `Tamiz ${eq.code} (${eq.sieve?.astmDesignation ?? "?"}): verificación interna vencida o sin registrar (periodicidad 6 meses).`,
      };
    }
    return { vigente: true };
  }

  if (eq.type === "SAND_CONE") {
    if (
      !eq.sandCone?.depositVerificationDueAt ||
      eq.sandCone.depositVerificationDueAt < now
    ) {
      return {
        vigente: false,
        motivo: `Cono de arena ${eq.code}: verificación de depósito/cono vencida o sin registrar (periodicidad 6 meses).`,
      };
    }
    if (
      !eq.sandCone?.sandDensityVerificationDueAt ||
      eq.sandCone.sandDensityVerificationDueAt < now
    ) {
      return {
        vigente: false,
        motivo: `Cono de arena ${eq.code}: verificación de arena normalizada vencida o sin registrar (periodicidad 3 meses).`,
      };
    }
    // Embudo (funnelMass): periodicidad no definida por Felipe — no bloquear.
    return { vigente: true };
  }

  return {
    vigente: false,
    motivo: `Tipo de equipo ${eq.type} no reconocido para cálculo de vigencia.`,
  };
}

/**
 * Consulta un Equipment por id con todos los includes necesarios para
 * computeVigente, y devuelve el resultado de vigencia.
 */
export async function isEquipmentVigente(
  equipmentId: number
): Promise<{ vigente: boolean; motivo?: string }> {
  const eq = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: {
      mold: { select: { verificationDueAt: true } },
      pycnometer: { select: { verificationDueAt: true } },
      sandCone: {
        select: {
          depositVerificationDueAt: true,
          sandDensityVerificationDueAt: true,
        },
      },
      sieve: { select: { verificationDueAt: true, astmDesignation: true } },
    },
  });

  if (!eq) {
    return { vigente: false, motivo: `Equipo id=${equipmentId} no encontrado.` };
  }

  return computeVigente(eq);
}

/**
 * Valida una lista de equipmentIds antes de crear/editar un ensayo.
 * - Si la lista está vacía → error (todo ensayo debe declarar al menos uno).
 * - Si algún equipo no está vigente → devuelve el primer mensaje de motivo.
 * - Si todos están vigentes → devuelve null.
 *
 * No conectado a controllers de ensayo todavía — Fase 3.
 */
export async function assertEquipmentUsable(
  equipmentIds: number[]
): Promise<string | null> {
  if (!equipmentIds || equipmentIds.length === 0) {
    return "equipmentIds es obligatorio: todo ensayo debe declarar al menos un equipo usado.";
  }

  for (const id of equipmentIds) {
    const result = await isEquipmentVigente(id);
    if (!result.vigente) {
      return result.motivo ?? `Equipo id=${id} no está vigente.`;
    }
  }

  return null;
}
