import { Router } from "express";
import {
  createSandConeTest,
  getSandConeTestById,
  listSandConeTestsBySample,
  updateSandConeTest,
  recalculateSandConeTest,
  approveSandConeTest,
} from "../controllers/sandConeTest.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "sand-cone-tests" }));

// Crear por muestra
router.post("/sample/:sampleId", createSandConeTest);

// Listar por muestra
router.get("/sample/:sampleId", listSandConeTestsBySample);

// Obtener
router.get("/:id", getSandConeTestById);

// Editar (revierte isApproved si ya estaba aprobado, exige reason)
router.put("/:id", updateSandConeTest);

// Recalcular
router.post("/:id/recalculate", recalculateSandConeTest);

// Aprobar (evento formal, separado de update/recalculate)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveSandConeTest);

export default router;
