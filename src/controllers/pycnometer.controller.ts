// src/controllers/pycnometer.controller.ts
//
// Catalogo de picnometros como instrumento trazable, mismo patron que
// molds.controller.ts: create/update para datos generales, calibrate
// como evento formal separado (Mf, Ma(ti), ti se registran una sola vez
// y se reutilizan en todos los ensayos de Densidad de Particulas Solidas
// que usen ese picnometro).
import { Response } from "express";
import prisma from "../prismaClient";
import { PycnometerStatus } from "../generated/prisma";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

// ----------------------------------------------------
// GET /api/pycnometers?active=true
// ----------------------------------------------------
export async function listPycnometers(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const pycnometers = await prisma.pycnometer.findMany({
      where: onlyActive ? { status: PycnometerStatus.ACTIVE } : undefined,
      orderBy: { code: "asc" },
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

    const pycnometer = await prisma.pycnometer.findUnique({ where: { id } });
    if (!pycnometer) return res.status(404).json({ message: "Picnometro no encontrado" });

    return res.status(200).json({ message: "OK", data: pycnometer });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/pycnometers
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

    const existing = await prisma.pycnometer.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un picnometro con ese código." });
    }

    const pycnometer = await prisma.pycnometer.create({
      data: {
        code: code.trim(),
        description: description ?? null,
        containerType: containerType ?? null,
        nominalCapacityMl:
          nominalCapacityMl !== undefined && nominalCapacityMl !== null
            ? Number(nominalCapacityMl)
            : null,
        status: status ?? PycnometerStatus.ACTIVE,
      },
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Pycnometer",
      entityId: pycnometer.id,
      previousValue: null,
      newValue: pycnometer,
    });

    return res.status(201).json({ message: "Picnometro creado", data: pycnometer });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/pycnometers/:id
// Edición de datos generales (no calibración -- ver calibratePycnometer).
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

    const data: any = {};
    if (description !== undefined) data.description = description;
    if (containerType !== undefined) data.containerType = containerType;
    if (nominalCapacityMl !== undefined) {
      data.nominalCapacityMl = nominalCapacityMl === null ? null : Number(nominalCapacityMl);
    }
    if (status !== undefined) data.status = status;

    const before = await prisma.pycnometer.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Picnometro no encontrado" });

    const updated = await prisma.pycnometer.update({ where: { id }, data });

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
// Evento formal de calibracion -- registra Mf, Ma(ti), ti de una sola vez
// (procedimiento independiente, reutilizable en todos los ensayos
// posteriores que usen este picnometro, por eso va separado de update).
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

    const { massEmptyG, massWaterAtCalTempG, calibrationTempC, calibrationCertUrl, calibratedAt, reason } =
      req.body;

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

    const before = await prisma.pycnometer.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Picnometro no encontrado" });

    const lastCalibrationAt = calibratedAt ? new Date(calibratedAt) : new Date();

    const updated = await prisma.pycnometer.update({
      where: { id },
      data: {
        massEmptyG: Number(massEmptyG),
        massWaterAtCalTempG: Number(massWaterAtCalTempG),
        calibrationTempC: Number(calibrationTempC),
        lastCalibrationAt,
        calibrationCertUrl: calibrationCertUrl ?? before.calibrationCertUrl,
      },
    });

    await registerAudit({
      userId,
      action: "CALIBRATE",
      entityType: "Pycnometer",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
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
