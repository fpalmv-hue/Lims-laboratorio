// src/controllers/test.controller.ts
import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

// POST /tests
// Crea un ensayo asociado a una muestra
export const createTest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { sampleId, type, norm, status } = req.body;

    if (!sampleId || !type) {
      return res.status(400).json({
        message: "sampleId y type son obligatorios",
      });
    }

    // Verificamos que la muestra exista
    const sample = await prisma.sample.findUnique({
      where: { id: Number(sampleId) },
    });

    if (!sample) {
      return res.status(404).json({ message: "Muestra no encontrada" });
    }

    const test = await prisma.test.create({
      data: {
        sampleId: Number(sampleId),
        type,
        norm,
        status: status ?? "PENDING",
      },
    });

    // Trazabilidad ISO 17025: registrar la creación del ensayo.
    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Test",
      entityId: test.id,
      previousValue: null,
      newValue: test,
    });

    return res.status(201).json({
      message: "Ensayo creado",
      data: test,
    });
  } catch (error) {
    console.error("Error en createTest:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /tests
// Permite listar ensayos, opcionalmente filtrando por sampleId
export const listTests = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId } = req.query;

    const where: any = {};

    if (sampleId) {
      where.sampleId = Number(sampleId);
    }

    const tests = await prisma.test.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sample: {
          select: {
            id: true,
            code: true,
            project: true,
          },
        },
      },
    });

    return res.json({
      message: "Tests retrieved successfully",
      data: tests,
    });
  } catch (error) {
    console.error("Error en listTests:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /tests/:id
export const getTestById = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);

    const test = await prisma.test.findUnique({
      where: { id },
      include: {
        sample: {
          select: {
            id: true,
            code: true,
            project: true,
            location: true,
          },
        },
      },
    });

    if (!test) {
      return res.status(404).json({ message: "Ensayo no encontrado" });
    }

    return res.json({
      message: "Test retrieved successfully",
      data: test,
    });
  } catch (error) {
    console.error("Error en getTestById:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// PUT /tests/:id
export const updateTest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    const { type, norm, status, reason } = req.body;

    const existing = await prisma.test.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ message: "Ensayo no encontrado" });
    }

    const updated = await prisma.test.update({
      where: { id },
      data: {
        type: type ?? existing.type,
        norm: norm ?? existing.norm,
        status: status ?? existing.status,
      },
    });

    // Trazabilidad ISO 17025: registrar el cambio con valor anterior y nuevo.
    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Test",
      entityId: updated.id,
      previousValue: existing,
      newValue: updated,
      reason,
    });

    return res.json({
      message: "Ensayo actualizado",
      data: updated,
    });
  } catch (error) {
    console.error("Error en updateTest:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
