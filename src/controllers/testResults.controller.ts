// src/controllers/testResults.controller.ts

import { Request, Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";

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
export const updateTestResult = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const { rawInputJson, calculatedJson, isValid } = req.body;

    const dataToUpdate: any = {};

    if (rawInputJson !== undefined) dataToUpdate.rawInputJson = rawInputJson;
    if (calculatedJson !== undefined) dataToUpdate.calculatedJson = calculatedJson;
    if (isValid !== undefined) dataToUpdate.isValid = isValid;

    const updated = await prisma.testResult.update({
      where: { id },
      data: dataToUpdate,
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

