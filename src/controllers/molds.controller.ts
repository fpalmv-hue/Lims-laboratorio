// src/controllers/molds.controller.ts
//
// Catálogo de moldes Proctor/CBR como instrumento trazable.
//
// Cambio de arquitectura (Phase 1 Equipment, 14-ago-2026):
// Mold ya no tiene code/status propios -- esos campos viven en la tabla
// Equipment padre (1:1 obligatorio). Crear un Mold implica crear su
// Equipment en la misma transacción. Leer un Mold siempre incluye su
// Equipment para exponer code/status.
//
// POST /api/molds/:id/verify: reemplaza al antiguo /calibrate. Mold es
// categoría NORMATIVE -- no tiene calibración externa; el evento
// periódico (3 meses, confirmado por Felipe) es una verificación interna.
import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

/** Agrega 3 meses calendario a una fecha. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ----------------------------------------------------
// GET /api/molds?active=true
// ----------------------------------------------------
export async function listMolds(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const molds = await prisma.mold.findMany({
      include: { equipment: true },
      where: onlyActive ? { equipment: { status: "ACTIVE" } } : undefined,
      orderBy: { equipment: { code: "asc" } },
    });

    return res.status(200).json({ message: "OK", data: molds });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// GET /api/molds/:id
// ----------------------------------------------------
export async function getMoldById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const mold = await prisma.mold.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!mold) return res.status(404).json({ message: "Molde no encontrado" });

    return res.status(200).json({ message: "OK", data: mold });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/molds
// Crea Equipment + Mold en una transacción atómica.
// Body: { code, description?, volumeCm3, tareMassG?, collarMassG?,
//         heightMm?, status? }
// ----------------------------------------------------
export async function createMold(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { code, description, volumeCm3, tareMassG, collarMassG, heightMm, status } = req.body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "code es obligatorio" });
    }
    if (volumeCm3 === undefined || volumeCm3 === null || !Number.isFinite(Number(volumeCm3))) {
      return res.status(400).json({ message: "volumeCm3 es obligatorio y debe ser numérico" });
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
          type: "MOLD",
          category: "NORMATIVE",
          status: status ?? "ACTIVE",
          description: description ?? null,
        },
      });
      const mold = await tx.mold.create({
        data: {
          equipmentId: equipment.id,
          description: description ?? null,
          volumeCm3: Number(volumeCm3),
          tareMassG: tareMassG !== undefined && tareMassG !== null ? Number(tareMassG) : null,
          collarMassG: collarMassG !== undefined && collarMassG !== null ? Number(collarMassG) : null,
          heightMm: heightMm !== undefined && heightMm !== null ? Number(heightMm) : null,
        },
        include: { equipment: true },
      });
      return mold;
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Mold",
      entityId: result.id,
      previousValue: null,
      newValue: result,
    });

    return res.status(201).json({ message: "Molde creado", data: result });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/molds/:id
// Edita datos del molde y/o su Equipment asociado.
// description/volumeCm3/tareMassG/collarMassG/heightMm → Mold.
// status → Equipment (status vive en Equipment, no en Mold).
// ----------------------------------------------------
export async function updateMold(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { description, volumeCm3, tareMassG, collarMassG, heightMm, status, reason } = req.body;

    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE" });
    }

    const before = await prisma.mold.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Molde no encontrado" });

    const moldData: any = {};
    if (description !== undefined) moldData.description = description;
    if (volumeCm3 !== undefined) moldData.volumeCm3 = Number(volumeCm3);
    if (tareMassG !== undefined) moldData.tareMassG = tareMassG === null ? null : Number(tareMassG);
    if (collarMassG !== undefined) moldData.collarMassG = collarMassG === null ? null : Number(collarMassG);
    if (heightMm !== undefined) moldData.heightMm = heightMm === null ? null : Number(heightMm);

    const updated = await prisma.$transaction(async (tx) => {
      if (status !== undefined) {
        await tx.equipment.update({
          where: { id: before.equipmentId },
          data: { status },
        });
      }
      return tx.mold.update({
        where: { id },
        data: moldData,
        include: { equipment: true },
      });
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Mold",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.status(200).json({ message: "Molde actualizado", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Molde no encontrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/molds/:id/verify
// Evento de verificación interna (Mold es NORMATIVE: solo verificación,
// sin calibración externa). Periodicidad: 3 meses (confirmado por Felipe).
// Actualiza Mold.lastVerificationAt y Mold.verificationDueAt.
// AuditAction.VERIFY (distinto de CALIBRATE que aplica a PRECISION/REFERENCE_STANDARD).
// ----------------------------------------------------
export async function verifyMold(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { verifiedAt, reason } = req.body;

    const before = await prisma.mold.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Molde no encontrado" });

    const lastVerificationAt = verifiedAt ? new Date(verifiedAt) : new Date();
    const verificationDueAt = addMonths(lastVerificationAt, 3);

    const updated = await prisma.mold.update({
      where: { id },
      data: { lastVerificationAt, verificationDueAt },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "Mold",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Verificación interna periódica (3 meses)",
    });

    return res.status(200).json({ message: "Verificación registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Molde no encontrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
