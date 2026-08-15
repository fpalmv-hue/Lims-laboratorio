// src/controllers/equipment.controller.ts
//
// Catálogo transversal de Equipment (Phase 2, 14-ago-2026).
// Solo maneja categorías PRECISION y REFERENCE_STANDARD — los equipos
// NORMATIVE (Mold, Pycnometer, SandCone) tienen su propio controller
// dedicado porque su calibración/verificación es específica de cada tipo.
//
// Endpoints:
//   POST   /api/equipment              crear PRECISION o REFERENCE_STANDARD
//   GET    /api/equipment              listado filtrable + isVigente
//   GET    /api/equipment/due-soon     vencidos o próximos a vencer
//   GET    /api/equipment/:id          detalle
//   PUT    /api/equipment/:id          editar description/status/calibrationBody
//   POST   /api/equipment/:id/verify   verificación interna (solo PRECISION)
//   POST   /api/equipment/:id/calibrate calibración externa (PRECISION + REFERENCE_STANDARD)
import type { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";
import { computeVigente } from "../utils/equipmentGuard";

// Coherencia entre category y type (conforme al enum EquipmentType del schema).
const NORMATIVE_TYPES = ["MOLD", "PYCNOMETER", "SAND_CONE", "SIEVE"] as const;
const PRECISION_TYPES = ["SCALE", "OVEN"] as const;
const REFERENCE_TYPES = ["REFERENCE_WEIGHT", "REFERENCE_THERMOMETER"] as const;

type EquipmentType =
  | "MOLD"
  | "PYCNOMETER"
  | "SAND_CONE"
  | "SCALE"
  | "OVEN"
  | "REFERENCE_WEIGHT"
  | "REFERENCE_THERMOMETER";

type EquipmentCategory = "NORMATIVE" | "PRECISION" | "REFERENCE_STANDARD";

function validateTypeCategoryCoherence(
  type: string,
  category: string
): string | null {
  if (category === "NORMATIVE" && !(NORMATIVE_TYPES as readonly string[]).includes(type)) {
    return `type "${type}" no es válido para category NORMATIVE. Tipos NORMATIVE: ${NORMATIVE_TYPES.join(", ")}.`;
  }
  if (category === "PRECISION" && !(PRECISION_TYPES as readonly string[]).includes(type)) {
    return `type "${type}" no es válido para category PRECISION. Tipos PRECISION: ${PRECISION_TYPES.join(", ")}.`;
  }
  if (
    category === "REFERENCE_STANDARD" &&
    !(REFERENCE_TYPES as readonly string[]).includes(type)
  ) {
    return `type "${type}" no es válido para category REFERENCE_STANDARD. Tipos REFERENCE_STANDARD: ${REFERENCE_TYPES.join(", ")}.`;
  }
  return null;
}

/** Include necesario para computeVigente sin generar N queries en listados. */
const VIGENTE_INCLUDE = {
  mold: { select: { verificationDueAt: true } },
  pycnometer: { select: { verificationDueAt: true } },
  sandCone: {
    select: {
      depositVerificationDueAt: true,
      sandDensityVerificationDueAt: true,
    },
  },
  sieve: { select: { verificationDueAt: true, astmDesignation: true } },
} as const;

function addVigente<T extends Parameters<typeof computeVigente>[0]>(eq: T) {
  const { vigente, motivo } = computeVigente(eq);
  return { ...eq, isVigente: vigente, ...(motivo ? { motivoVencimiento: motivo } : {}) };
}

/** Calcula la fecha de vencimiento más próxima relevante para un equipo. */
function nextDueDateOf(
  eq: Parameters<typeof computeVigente>[0] & {
    mold?: { verificationDueAt: Date | null } | null;
    pycnometer?: { verificationDueAt: Date | null } | null;
    sandCone?: {
      depositVerificationDueAt: Date | null;
      sandDensityVerificationDueAt: Date | null;
    } | null;
  }
): Date | null {
  const candidates: (Date | null | undefined)[] = [];

  if (eq.category === "PRECISION") {
    candidates.push(eq.calibrationDueAt, eq.verificationDueAt);
  } else if (eq.category === "REFERENCE_STANDARD") {
    candidates.push(eq.calibrationDueAt);
  } else if (eq.type === "MOLD") {
    candidates.push(eq.mold?.verificationDueAt);
  } else if (eq.type === "PYCNOMETER") {
    candidates.push(eq.pycnometer?.verificationDueAt);
  } else if (eq.type === "SIEVE") {
    candidates.push(eq.sieve?.verificationDueAt);
  } else if (eq.type === "SAND_CONE") {
    candidates.push(
      eq.sandCone?.depositVerificationDueAt,
      eq.sandCone?.sandDensityVerificationDueAt
    );
  }

  // null o undefined = sin fecha registrada = ya vencido
  if (candidates.some((d) => d == null)) return null;

  const valid = candidates.filter((d): d is Date => d instanceof Date);
  if (valid.length === 0) return null;
  return valid.reduce((min, d) => (d < min ? d : min));
}

// ─────────────────────────────────────────────────────────────
// POST /api/equipment
// Solo PRECISION o REFERENCE_STANDARD. Los NORMATIVE se crean via
// /api/molds, /api/pycnometers, /api/sand-cones (Phase 1).
// ─────────────────────────────────────────────────────────────
export async function createEquipment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const { code, type, category, description } = req.body as {
      code?: string;
      type?: string;
      category?: string;
      description?: string;
    };

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "code es obligatorio." });
    }
    if (!type) return res.status(400).json({ message: "type es obligatorio." });
    if (!category) return res.status(400).json({ message: "category es obligatorio." });

    if (category === "NORMATIVE") {
      return res.status(400).json({
        message:
          "Los equipos NORMATIVE (MOLD/PYCNOMETER/SAND_CONE) se crean vía /api/molds, /api/pycnometers o /api/sand-cones, no acá.",
      });
    }

    if (!["PRECISION", "REFERENCE_STANDARD"].includes(category)) {
      return res
        .status(400)
        .json({ message: "category debe ser PRECISION o REFERENCE_STANDARD." });
    }

    const coherenceError = validateTypeCategoryCoherence(type, category);
    if (coherenceError) return res.status(400).json({ message: coherenceError });

    const existing = await prisma.equipment.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un equipo con ese código." });
    }

    const equipment = await prisma.equipment.create({
      data: {
        code: code.trim(),
        type: type as EquipmentType,
        category: category as EquipmentCategory,
        description: description ?? null,
        status: "ACTIVE",
      },
      include: VIGENTE_INCLUDE,
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Equipment",
      entityId: equipment.id,
      previousValue: null,
      newValue: equipment,
    });

    return res.status(201).json({ message: "Equipo creado", data: addVigente(equipment) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/equipment?type=&category=&status=
// ─────────────────────────────────────────────────────────────
export async function listEquipment(req: AuthRequest, res: Response) {
  try {
    const { type, category, status } = req.query as Record<string, string | undefined>;

    const where: any = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (status) where.status = status;

    const equipments = await prisma.equipment.findMany({
      where,
      include: VIGENTE_INCLUDE,
      orderBy: { code: "asc" },
    });

    return res.json({
      message: "OK",
      data: equipments.map(addVigente),
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/equipment/due-soon?days=30
// Equipos cuya próxima fecha relevante vence dentro de N días
// o ya está vencida (overdue). Null = sin fecha = overdue.
// ─────────────────────────────────────────────────────────────
export async function listEquipmentDueSoon(req: AuthRequest, res: Response) {
  try {
    const days = Math.max(0, Number(req.query.days ?? 30));
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const all = await prisma.equipment.findMany({
      where: { status: "ACTIVE" },
      include: VIGENTE_INCLUDE,
      orderBy: { code: "asc" },
    });

    const results = all
      .map((eq) => {
        const next = nextDueDateOf(eq);
        const overdue = next === null || next < now;
        const dueSoon = next === null || next <= cutoff;
        const daysUntilDue =
          next === null
            ? null
            : Math.round((next.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return { eq, next, overdue, dueSoon, daysUntilDue };
      })
      .filter((r) => r.dueSoon);

    const data = results.map(({ eq, overdue, daysUntilDue }) => ({
      ...addVigente(eq),
      overdue,
      daysUntilDue,
    }));

    return res.json({ message: "OK", data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/equipment/:id
// ─────────────────────────────────────────────────────────────
export async function getEquipmentById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: VIGENTE_INCLUDE,
    });
    if (!equipment) return res.status(404).json({ message: "Equipo no encontrado." });

    return res.json({ message: "OK", data: addVigente(equipment) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/equipment/:id
// Editar description / status / calibrationBody.
// Para NORMATIVE el status se edita vía su controller específico
// (PUT /api/molds/:id, etc.) -- este endpoint lo rechaza.
// ─────────────────────────────────────────────────────────────
export async function updateEquipment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const before = await prisma.equipment.findUnique({
      where: { id },
      include: VIGENTE_INCLUDE,
    });
    if (!before) return res.status(404).json({ message: "Equipo no encontrado." });

    if (before.category === "NORMATIVE") {
      return res.status(400).json({
        message:
          "El status de equipos NORMATIVE se edita vía su controller específico (PUT /api/molds/:id, /api/pycnometers/:id, /api/sand-cones/:id).",
      });
    }

    const { description, status, calibrationBody, reason } = req.body as {
      description?: string;
      status?: string;
      calibrationBody?: string;
      reason?: string;
    };

    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE." });
    }

    const data: any = {};
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (calibrationBody !== undefined) data.calibrationBody = calibrationBody;

    const updated = await prisma.equipment.update({
      where: { id },
      data,
      include: VIGENTE_INCLUDE,
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Equipment",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.json({ message: "Equipo actualizado", data: addVigente(updated) });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Equipo no encontrado." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/equipment/:id/verify
// Solo para PRECISION. Verifica contra un equipo patrón
// (standardEquipmentId debe ser REFERENCE_STANDARD y ACTIVE).
// Periodicidad: 6 meses (Felipe). AuditAction.VERIFY.
// ─────────────────────────────────────────────────────────────
export async function verifyEquipment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const before = await prisma.equipment.findUnique({
      where: { id },
      include: VIGENTE_INCLUDE,
    });
    if (!before) return res.status(404).json({ message: "Equipo no encontrado." });

    if (before.category === "NORMATIVE") {
      return res.status(400).json({
        message:
          "Los equipos NORMATIVE se verifican vía su endpoint específico (/api/molds/:id/verify, /api/pycnometers/:id/calibrate, /api/sand-cones/:id/calibrate-deposit|sand).",
      });
    }
    if (before.category === "REFERENCE_STANDARD") {
      return res.status(400).json({
        message:
          "Los equipos patrón (REFERENCE_STANDARD) no se verifican internamente — se calibran externamente vía POST /api/equipment/:id/calibrate.",
      });
    }

    const { standardEquipmentId, resultNotes, verifiedAt } = req.body as {
      standardEquipmentId?: number;
      resultNotes?: string;
      verifiedAt?: string;
    };

    if (!standardEquipmentId || !Number.isFinite(Number(standardEquipmentId))) {
      return res
        .status(400)
        .json({ message: "standardEquipmentId es obligatorio: id del equipo patrón usado." });
    }

    const standard = await prisma.equipment.findUnique({
      where: { id: Number(standardEquipmentId) },
    });
    if (!standard) {
      return res
        .status(400)
        .json({ message: `Equipo patrón id=${standardEquipmentId} no encontrado.` });
    }
    if (standard.category !== "REFERENCE_STANDARD") {
      return res.status(400).json({
        message: `standardEquipmentId debe referenciar un equipo con category REFERENCE_STANDARD. El equipo "${standard.code}" es ${standard.category}.`,
      });
    }
    if (standard.status !== "ACTIVE") {
      return res.status(400).json({
        message: `El equipo patrón "${standard.code}" no está ACTIVE (status actual: ${standard.status}).`,
      });
    }

    const lastVerificationAt = verifiedAt ? new Date(verifiedAt) : new Date();
    const verificationDueAt = new Date(lastVerificationAt);
    verificationDueAt.setMonth(verificationDueAt.getMonth() + 6);

    const updated = await prisma.equipment.update({
      where: { id },
      data: { lastVerificationAt, verificationDueAt },
      include: VIGENTE_INCLUDE,
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "Equipment",
      entityId: updated.id,
      previousValue: before,
      newValue: {
        ...updated,
        standardEquipmentId: Number(standardEquipmentId),
        resultNotes: resultNotes ?? null,
      },
      reason: resultNotes ?? `Verificación interna contra patrón id=${standardEquipmentId}`,
    });

    return res.json({ message: "Verificación registrada", data: addVigente(updated) });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Equipo no encontrado." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/equipment/:id/calibrate
// Solo PRECISION o REFERENCE_STANDARD. Rechaza NORMATIVE.
// calibrationDueAt = calibratedAt + 1 año. AuditAction.CALIBRATE.
// Si viene certAttachmentId, vincula el Attachment a este equipo.
// ─────────────────────────────────────────────────────────────
export async function calibrateEquipment(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const before = await prisma.equipment.findUnique({
      where: { id },
      include: VIGENTE_INCLUDE,
    });
    if (!before) return res.status(404).json({ message: "Equipo no encontrado." });

    if (before.category === "NORMATIVE") {
      return res.status(400).json({
        message:
          "Los equipos NORMATIVE (Mold/Pycnometer/SandCone) no tienen calibración externa acreditada — solo verificación interna. Ver periodicidades en CLAUDE.md.",
      });
    }

    const { calibrationBody, certAttachmentId, calibratedAt, reason } = req.body as {
      calibrationBody?: string;
      certAttachmentId?: number;
      calibratedAt?: string;
      reason?: string;
    };

    if (!calibrationBody || typeof calibrationBody !== "string" || !calibrationBody.trim()) {
      return res
        .status(400)
        .json({ message: "calibrationBody es obligatorio: nombre del organismo metrológico acreditado." });
    }

    // Validar y vincular el adjunto de certificado si viene
    if (certAttachmentId !== undefined) {
      const attachment = await prisma.attachment.findUnique({
        where: { id: Number(certAttachmentId) },
      });
      if (!attachment) {
        return res
          .status(400)
          .json({ message: `Attachment id=${certAttachmentId} no encontrado.` });
      }
      if (attachment.equipmentId !== null && attachment.equipmentId !== id) {
        return res.status(400).json({
          message: `Attachment id=${certAttachmentId} ya está vinculado al equipo id=${attachment.equipmentId}.`,
        });
      }
      if (attachment.equipmentId === null) {
        await prisma.attachment.update({
          where: { id: Number(certAttachmentId) },
          data: { equipmentId: id },
        });
      }
    }

    const lastCalibrationAt = calibratedAt ? new Date(calibratedAt) : new Date();
    const calibrationDueAt = new Date(lastCalibrationAt);
    calibrationDueAt.setFullYear(calibrationDueAt.getFullYear() + 1);

    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        lastCalibrationAt,
        calibrationDueAt,
        calibrationBody: calibrationBody.trim(),
      },
      include: VIGENTE_INCLUDE,
    });

    await registerAudit({
      userId,
      action: "CALIBRATE",
      entityType: "Equipment",
      entityId: updated.id,
      previousValue: before,
      newValue: { ...updated, certAttachmentId: certAttachmentId ?? null },
      reason: reason ?? `Calibración externa por ${calibrationBody.trim()}`,
    });

    return res.json({ message: "Calibración registrada", data: addVigente(updated) });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Equipo no encontrado." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
