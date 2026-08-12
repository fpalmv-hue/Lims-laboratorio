// src/controllers/molds.controller.ts
import { Response } from "express";
import prisma from "../prismaClient";
import { MoldStatus } from "../generated/prisma";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

// ----------------------------------------------------
// GET /api/molds?active=true
// ----------------------------------------------------
export async function listMolds(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const molds = await prisma.mold.findMany({
      where: onlyActive ? { status: MoldStatus.ACTIVE } : undefined,
      orderBy: { code: "asc" },
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

    const mold = await prisma.mold.findUnique({ where: { id } });
    if (!mold) return res.status(404).json({ message: "Molde no encontrado" });

    return res.status(200).json({ message: "OK", data: mold });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/molds
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

    const existing = await prisma.mold.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un molde con ese código." });
    }

    const mold = await prisma.mold.create({
      data: {
        code: code.trim(),
        description: description ?? null,
        volumeCm3: Number(volumeCm3),
        tareMassG: tareMassG !== undefined && tareMassG !== null ? Number(tareMassG) : null,
        collarMassG: collarMassG !== undefined && collarMassG !== null ? Number(collarMassG) : null,
        heightMm: heightMm !== undefined && heightMm !== null ? Number(heightMm) : null,
        status: status ?? MoldStatus.ACTIVE,
      },
    });

    // Trazabilidad ISO 17025: registrar la creación del molde.
    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Mold",
      entityId: mold.id,
      previousValue: null,
      newValue: mold,
    });

    return res.status(201).json({ message: "Molde creado", data: mold });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/molds/:id
// Edición de datos generales (no calibración -- ver calibrateMold).
// También se usa para dar de baja un molde (status: OUT_OF_SERVICE)
// en vez de borrarlo físicamente, para no perder su historial.
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

    const data: any = {};
    if (description !== undefined) data.description = description;
    if (volumeCm3 !== undefined) data.volumeCm3 = Number(volumeCm3);
    if (tareMassG !== undefined) data.tareMassG = tareMassG === null ? null : Number(tareMassG);
    if (collarMassG !== undefined) data.collarMassG = collarMassG === null ? null : Number(collarMassG);
    if (heightMm !== undefined) data.heightMm = heightMm === null ? null : Number(heightMm);
    if (status !== undefined) data.status = status;

    const before = await prisma.mold.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Molde no encontrado" });

    const updated = await prisma.mold.update({ where: { id }, data });

    // Trazabilidad ISO 17025: registrar el cambio con valor anterior y nuevo.
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
// POST /api/molds/:id/calibrate
// Evento formal de calibración -- separado de updateMold porque para
// un auditor de INN una calibración es un evento propio (fecha,
// certificado), no una edición cualquiera de datos.
// ----------------------------------------------------
export async function calibrateMold(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { calibrationCertUrl, calibratedAt, reason } = req.body;

    const before = await prisma.mold.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Molde no encontrado" });

    const lastCalibrationAt = calibratedAt ? new Date(calibratedAt) : new Date();

    const updated = await prisma.mold.update({
      where: { id },
      data: {
        lastCalibrationAt,
        calibrationCertUrl: calibrationCertUrl ?? before.calibrationCertUrl,
      },
    });

    // Trazabilidad ISO 17025: registrar la calibración como evento propio.
    await registerAudit({
      userId,
      action: "CALIBRATE",
      entityType: "Mold",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.status(200).json({ message: "Calibración registrada", data: updated });
  } catch (err: any) {
    console.error(err);

    if (err.code === "P2025") {
      return res.status(404).json({ message: "Molde no encontrado" });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
