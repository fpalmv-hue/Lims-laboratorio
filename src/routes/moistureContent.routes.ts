import { Router } from "express";
import {
  createMoistureContent,
  getMoistureContentById,
  listMoistureContentsBySample,
  updateMoistureContent,
  recalculateMoistureContent,
  approveMoistureContent,
} from "../controllers/moistureContent.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "moisture-contents" }));

// Crear por muestra
router.post("/sample/:sampleId", createMoistureContent);

// Listar por muestra
router.get("/sample/:sampleId", listMoistureContentsBySample);

// Obtener
router.get("/:id", getMoistureContentById);

// Editar (revierte isApproved si ya estaba aprobado, exige reason)
router.put("/:id", updateMoistureContent);

// Recalcular
router.post("/:id/recalculate", recalculateMoistureContent);

// Aprobar (evento formal, separado de update/recalculate)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveMoistureContent);

export default router;
