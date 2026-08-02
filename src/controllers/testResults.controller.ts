// src/controllers/testResults.controller.ts

import { Request, Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";

// ----------------------------------------------------
// Crear resultado de ensayo
// POST /test-results
// ----------------------------------------------------
export const createTestResult = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { testId, rawInputJson } = req.body;

    if (!testId || !rawInputJson) {
      return res
        .status(400)
        .json({ message: "testId y rawInputJson son obligatorios" });
    }

    // Aseguramos que el ensayo existe
    const test = await prisma.test.findUnique({
      where: { id: Number(testId) },
    });

    if (!test) {
      return res.status(404).json({ message: "Ensayo no encontrado" });
    }

    const result = await prisma.testResult.create({
      data: {
        testId: Number(testId),
        rawInputJson,
        // JSON vacío por ahora, luego aquí irán los cálculos automáticos
        calculatedJson: {}, // <- CLAVE PARA QUE PASE EL TIPO
        isValid: false,
        createdById: userId,
      },
    });

    // Trazabilidad ISO 17025: registrar la creación del resultado.
    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "TestResult",
      entityId: result.id,
      previousValue: null,
      newValue: result,
    });

    return res
      .status(201)
      .json({ message: "Resultado creado", data: result });
  } catch (error) {
    console.error("Error al crear resultado de ensayo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ----------------------------------------------------
// Obtener todos los resultados
// GET /test-results
// ----------------------------------------------------
export const getTestResults = async (req: Request, res: Response) => {
  try {
    const results = await prisma.testResult.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      message: "Resultados obtenidos correctamente",
      data: results,
    });
  } catch (error) {
    console.error("Error al listar resultados de ensayo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ----------------------------------------------------
// Obtener resultado por ID
// GET /test-results/:id
// ----------------------------------------------------
export const getTestResultById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const result = await prisma.testResult.findUnique({
      where: { id },
    });

    if (!result) {
      return res.status(404).json({ message: "Resultado no encontrado" });
    }

    return res.json({
      message: "Resultado obtenido correctamente",
      data: result,
    });
  } catch (error) {
    console.error("Error al obtener resultado de ensayo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ----------------------------------------------------
// Actualizar resultado
// PUT /test-results/:id
// ----------------------------------------------------
export const updateTestResult = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const { rawInputJson, calculatedJson, isValid, reason } = req.body;

    const dataToUpdate: any = {};

    if (rawInputJson !== undefined) dataToUpdate.rawInputJson = rawInputJson;
    if (calculatedJson !== undefined) dataToUpdate.calculatedJson = calculatedJson;
    if (isValid !== undefined) dataToUpdate.isValid = isValid;

    // Capturamos el estado ANTES de modificar, para el AuditLog.
    const before = await prisma.testResult.findUnique({ where: { id } });

    if (!before) {
      return res.status(404).json({ message: "Resultado no encontrado" });
    }

    // Regla ISO 17025: si el resultado ya estaba aprobado, reason es
    // obligatorio, y la edición revierte automáticamente isApproved a
    // false (vuelve a quedar pendiente de visado por Jefatura/Calidad).
    const guardMsg = assertReasonIfApproved(before.isApproved, reason);
    if (guardMsg) {
      return res.status(400).json({ message: guardMsg });
    }
    Object.assign(dataToUpdate, approvalResetIfNeeded(before.isApproved));

    const updated = await prisma.testResult.update({
      where: { id },
      data: dataToUpdate,
    });

    // Trazabilidad ISO 17025: registrar el cambio con valor anterior y
    // nuevo (incluye el revert de isApproved si aplicó).
    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "TestResult",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.json({
      message: "Resultado actualizado correctamente",
      data: updated,
    });
  } catch (error) {
    console.error("Error al actualizar resultado de ensayo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ----------------------------------------------------
// Aprobar resultado (evento formal, separado de update)
// POST /test-results/:id/approve
// Requiere rol ADMIN, JEFE o CALIDAD -- idealmente distinto de quien
// ejecutó el ensayo (segregación de funciones para ISO 17025).
// ----------------------------------------------------
export const approveTestResult = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const before = await prisma.testResult.findUnique({ where: { id } });

    if (!before) {
      return res.status(404).json({ message: "Resultado no encontrado" });
    }

    if (before.isApproved) {
      return res.status(409).json({ message: "Este resultado ya estaba aprobado" });
    }

    const updated = await prisma.testResult.update({
      where: { id },
      data: {
        isApproved: true,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    // Trazabilidad ISO 17025: registrar la aprobación como evento propio.
    await registerAudit({
      userId,
      action: "APPROVE",
      entityType: "TestResult",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: req.body?.reason,
    });

    return res.json({
      message: "Resultado aprobado correctamente",
      data: updated,
    });
  } catch (error) {
    console.error("Error al aprobar resultado de ensayo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
