// src/routes/testResults.routes.ts

import { Router } from "express";
import {
  createTestResult,
  getTestResultById,
  updateTestResult,
  getTestResults,   // 👈 este es el nombre correcto
  approveTestResult,
} from "../controllers/testResults.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

// Todas las rutas de resultados de ensayo requieren estar logueado
router.use(requireAuth);

// Crear resultado de ensayo
// POST /test-results
router.post("/", createTestResult);

// Listar resultados (más adelante podemos filtrar por testId, sampleId, status)
// GET /test-results
router.get("/", getTestResults);

// Obtener un resultado por ID
// GET /test-results/:id
router.get("/:id", getTestResultById);

// Actualizar resultado (solo ADMIN o JEFE)
// PUT /test-results/:id
router.put(
  "/:id",
  requireRole(["ADMIN", "JEFE"]),
  updateTestResult
);

// Aprobar resultado (evento formal, separado de update)
// POST /test-results/:id/approve
router.post(
  "/:id/approve",
  requireRole(["ADMIN", "JEFE", "CALIDAD"]),
  approveTestResult
);

export default router;
