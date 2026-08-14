// src/controllers/pycnometer.controller.ts
//
// Catálogo de picnómetros como instrumento trazable.
// Mismo patrón que molds.controller.ts tras la refactorización
// Equipment (Phase 1, 14-ago-2026):
// - code/status viven en Equipment padre (1:1).
// - Crear Pycnometer = crear Equipment + Pycnometer en transacción.
// - /calibrate registra los valores Mf/Ma(ti)/ti en Pycnometer
//   (los usa particleDensityCalc.ts directamente) y además actualiza
//   Pycnometer.lastVerificationAt/verificationDueAt (6 meses, Felipe).
//   Sigue llamándose /calibrate porque en el contexto del picnómetro
//   "calibrar" = medir Mf/Ma(ti)/ti, no certificación externa.
import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

/** Agrega N meses calendario a una fecha. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ----------------------------------------------------
// GET /api/pycnometers?active=true
// ----------------------------------------------------
export async function listPycnometers(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const pycnometers = await prisma.pycnometer.findMany({
      include: { equipment: true },
      where: onlyActive ? { equipment: { status: "ACTIVE" } } : undefined,
      orderBy: { equipment: { code: "asc" } },
    });

    return res.status(200).json({ message: "OK", data: pycnometers });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// GET /api/pycnometers/:id
// ----------------------------------------------------
export async function getPycnometerById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const pycnometer = await prisma.pycnometer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!pycnometer) return res.status(404).json({ message: "Picnometro no encontrado" });

    return res.status(200).json({ message: "OK", data: pycnometer });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/pycnometers
// Crea Equipment + Pycnometer en transacción atómica.
// Body: { code, description?, containerType?, nominalCapacityMl?, status? }
// ----------------------------------------------------
export async function createPycnometer(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { code, description, containerType, nominalCapacityMl, status } = req.body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "code es obligatorio" });
    }
    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE" });
    }

    const existingEquipment = await prisma.equipment.findUnique({ where: { code: code.trim() } });
    if (existingEquipment) {
      return res.status(409).json({ message: "Ya existe un equipo con ese código." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const equipment = await tx.equipment.create({
        data: {
          code: code.trim(),
          type: "PYCNOMETER",
          category: "NORMATIVE",
          status: status ?? "ACTIVE",
          description: description ?? null,
        },
      });
      const pycnometer = await tx.pycnometer.create({
        data: {
          equipmentId: equipment.id,
          description: description ?? null,
          containerType: containerType ?? null,
          nominalCapacityMl:
            nominalCapacityMl !== undefined && nominalCapacityMl !== null
              ? Number(nominalCapacityMl)
              : null,
        },
        include: { equipment: true },
      });
      return pycnometer;
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Pycnometer",
      entityId: result.id,
      previousValue: null,
      newValue: result,
    });

    return res.status(201).json({ message: "Picnometro creado", data: result });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/pycnometers/:id
// Edita datos del picnómetro. status → Equipment.
// ----------------------------------------------------
export async function updatePycnometer(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { description, containerType, nominalCapacityMl, status, reason } = req.body;

    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE" });
    }

    const before = await prisma.pycnometer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Picnometro no encontrado" });

    const pycData: any = {};
    if (description !== undefined) pycData.description = description;
    if (containerType !== undefined) pycData.containerType = containerType;
    if (nominalCapacityMl !== undefined) {
      pycData.nominalCapacityMl = nominalCapacityMl === null ? null : Number(nominalCapacityMl);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (status !== undefined) {
        await tx.equipment.update({
          where: { id: before.equipmentId },
          data: { status },
        });
      }
      return tx.pycnometer.update({
        where: { id },
        data: pycData,
        include: { equipment: true },
      });
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Pycnometer",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.status(200).json({ message: "Picnometro actualizado", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Picnometro no encontrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/pycnometers/:id/calibrate
// Registra la calibración geométrica del picnómetro (Mf, Ma(ti), ti).
// Estos valores los consume particleDensityCalc.ts directamente.
// También actualiza lastVerificationAt/verificationDueAt (6 meses),
// que es lo que equipmentGuard.ts verificará en Phase 2.
// AuditAction.VERIFY (verificación interna NORMATIVE, no certificación).
// ----------------------------------------------------
export async function calibratePycnometer(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { massEmptyG, massWaterAtCalTempG, calibrationTempC, calibratedAt, reason } = req.body;

    if (!Number.isFinite(Number(massEmptyG))) {
      return res.status(400).json({ message: "massEmptyG (Mf) es obligatorio y debe ser numérico" });
    }
    if (!Number.isFinite(Number(massWaterAtCalTempG))) {
      return res
        .status(400)
        .json({ message: "massWaterAtCalTempG (Ma en ti) es obligatorio y debe ser numérico" });
    }
    if (!Number.isFinite(Number(calibrationTempC))) {
      return res.status(400).json({ message: "calibrationTempC (ti) es obligatorio y debe ser numérico" });
    }

    const before = await prisma.pycnometer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Picnometro no encontrado" });

    const lastVerificationAt = calibratedAt ? new Date(calibratedAt) : new Date();
    const verificationDueAt = addMonths(lastVerificationAt, 6);

    const updated = await prisma.pycnometer.update({
      where: { id },
      data: {
        massEmptyG: Number(massEmptyG),
        massWaterAtCalTempG: Number(massWaterAtCalTempG),
        calibrationTempC: Number(calibrationTempC),
        lastVerificationAt,
        verificationDueAt,
      },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "Pycnometer",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Calibración geométrica del picnómetro (Mf/Ma(ti)/ti) — verificación interna 6 meses",
    });

    return res.status(200).json({ message: "Calibración registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Picnometro no encontrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
