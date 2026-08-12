import { Router } from "express";
import {
  createParticleDensity,
  getParticleDensityById,
  listParticleDensitiesBySample,
  updateParticleDensity,
  recalculateParticleDensity,
  approveParticleDensity,
} from "../controllers/particleDensity.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "particle-densities" }));

// Crear por muestra
router.post("/sample/:sampleId", createParticleDensity);

// Listar por muestra
router.get("/sample/:sampleId", listParticleDensitiesBySample);

// Obtener
router.get("/:id", getParticleDensityById);

// Editar (revierte isApproved si ya estaba aprobado, exige reason)
router.put("/:id", updateParticleDensity);

// Recalcular (util si el picnometro se re-calibro despues)
router.post("/:id/recalculate", recalculateParticleDensity);

// Aprobar (evento formal, separado de update/recalculate)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveParticleDensity);

export default router;
