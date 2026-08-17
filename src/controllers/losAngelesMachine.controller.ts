// src/controllers/losAngelesMachine.controller.ts
//
// Catálogo de la Máquina de Los Ángeles como instrumento trazable.
// Mismo patrón que sieves.controller.ts / molds.controller.ts:
// - code/status viven en Equipment padre (1:1, category NORMATIVE).
// - Crear = crear Equipment + LosAngelesMachine en $transaction.
// - POST /:id/verify (no /calibrate — sin calibración externa
//   acreditada, solo verificación interna, periodicidad 6 meses,
//   confirmado por Felipe 18-ago-2026).
import type { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ----------------------------------------------------
// GET /api/los-angeles-machines?active=true
// ----------------------------------------------------
export async function listLosAngelesMachines(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const machines = await prisma.losAngelesMachine.findMany({
      include: { equipment: true },
      where: onlyActive ? { equipment: { status: "ACTIVE" } } : undefined,
      orderBy: { id: "asc" },
    });

    return res.json({ message: "OK", data: machines });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// GET /api/los-angeles-machines/:id
// ----------------------------------------------------
export async function getLosAngelesMachineById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const machine = await prisma.losAngelesMachine.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!machine) return res.status(404).json({ message: "Máquina de Los Ángeles no encontrada." });

    return res.json({ message: "OK", data: machine });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/los-angeles-machines
// Body: { code, description?, cylinderDiameterMm?, cylinderLengthMm?, rotationSpeedRpm? }
// ----------------------------------------------------
export async function createLosAngelesMachine(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const { code, description, cylinderDiameterMm, cylinderLengthMm, rotationSpeedRpm } = req.body as {
      code?: string;
      description?: string;
      cylinderDiameterMm?: number;
      cylinderLengthMm?: number;
      rotationSpeedRpm?: number;
    };

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "code es obligatorio." });
    }

    const existing = await prisma.equipment.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un equipo con ese código." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const equipment = await tx.equipment.create({
        data: {
          code: code.trim(),
          type: "LOS_ANGELES_MACHINE",
          category: "NORMATIVE",
          status: "ACTIVE",
          description: description ?? null,
        },
      });
      const machine = await tx.losAngelesMachine.create({
        data: {
          equipmentId: equipment.id,
          description: description ?? null,
          cylinderDiameterMm: cylinderDiameterMm ?? null,
          cylinderLengthMm: cylinderLengthMm ?? null,
          rotationSpeedRpm: rotationSpeedRpm ?? null,
        },
        include: { equipment: true },
      });
      return machine;
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "LosAngelesMachine",
      entityId: result.id,
      previousValue: null,
      newValue: result,
    });

    return res.status(201).json({ message: "Máquina de Los Ángeles creada", data: result });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/los-angeles-machines/:id
// ----------------------------------------------------
export async function updateLosAngelesMachine(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const { description, cylinderDiameterMm, cylinderLengthMm, rotationSpeedRpm, status, reason } = req.body as {
      description?: string;
      cylinderDiameterMm?: number;
      cylinderLengthMm?: number;
      rotationSpeedRpm?: number;
      status?: string;
      reason?: string;
    };

    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE." });
    }

    const before = await prisma.losAngelesMachine.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Máquina de Los Ángeles no encontrada." });

    const data: any = {};
    if (description !== undefined) data.description = description;
    if (cylinderDiameterMm !== undefined) data.cylinderDiameterMm = cylinderDiameterMm;
    if (cylinderLengthMm !== undefined) data.cylinderLengthMm = cylinderLengthMm;
    if (rotationSpeedRpm !== undefined) data.rotationSpeedRpm = rotationSpeedRpm;

    const updated = await prisma.$transaction(async (tx) => {
      if (status !== undefined) {
        await tx.equipment.update({ where: { id: before.equipmentId }, data: { status } });
      }
      return tx.losAngelesMachine.update({
        where: { id },
        data,
        include: { equipment: true },
      });
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "LosAngelesMachine",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.json({ message: "Máquina de Los Ángeles actualizada", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Máquina de Los Ángeles no encontrada." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/los-angeles-machines/:id/verify
// Verificación interna periódica. Periodicidad: 6 meses (confirmado por
// Felipe 18-ago-2026 -- la norma no especifica frecuencia numérica).
// ----------------------------------------------------
export async function verifyLosAngelesMachine(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const { verifiedAt, reason } = req.body as { verifiedAt?: string; reason?: string };

    const before = await prisma.losAngelesMachine.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Máquina de Los Ángeles no encontrada." });

    const lastVerificationAt = verifiedAt ? new Date(verifiedAt) : new Date();
    const verificationDueAt = addMonths(lastVerificationAt, 6);

    const updated = await prisma.losAngelesMachine.update({
      where: { id },
      data: { lastVerificationAt, verificationDueAt },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "LosAngelesMachine",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Verificación interna periódica (6 meses)",
    });

    return res.json({ message: "Verificación registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Máquina de Los Ángeles no encontrada." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
