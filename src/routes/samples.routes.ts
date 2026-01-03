// src/routes/samples.routes.ts

import { Router } from "express";

import {
  createSample,
  listSamples,
  getSampleById,
  getSampleWithTests,
  updateSample,
  deleteSample,
} from "../controllers/samples.controller";

import {
  upsertAtterberg,
  getAtterbergBySample,
  // createAtterberg, // solo si decides mantener POST
} from "../controllers/atterbergController";

import { requireRole } from "../middlewares/auth";

const router = Router();

//
// ─────────────────────────────────────
//   MUESTRAS
// ─────────────────────────────────────
//

// Crear muestra: solo ADMIN (por ahora)
router.post("/", requireRole("ADMIN"), createSample);

// Listar / filtrar / paginar muestras
router.get("/", listSamples);

// Muestra + ensayos (ficha completa)
router.get("/:id/full", getSampleWithTests);

// Detalle simple de muestra
router.get("/:id", getSampleById);

// Actualizar muestra: solo ADMIN
router.put("/:id", requireRole("ADMIN"), updateSample);

// Eliminar muestra: solo ADMIN
router.delete("/:id", requireRole("ADMIN"), deleteSample);

//
// ─────────────────────────────────────
//   ATTERBERG (1:1 por muestra)
// ─────────────────────────────────────
//

// Obtener Atterberg por muestra
router.get("/:sampleId/atterberg", getAtterbergBySample);

// Crear o actualizar Atterberg (UPSERT)
router.put("/:sampleId/atterberg", upsertAtterberg);

// (opcional)
// router.post("/:sampleId/atterberg", createAtterberg);

export default router;
