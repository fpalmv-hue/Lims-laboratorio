// src/routes/granulometry.routes.ts
import { Router } from "express";
import {
  createGranulometry,
  getGranulometryById,
  getGranulometriesBySample,
  listGranulometries,
  recalculateGranulometry,
  updateGranulometrySieves,
  approveGranulometry,
} from "../controllers/granulometry.controller";

import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.post("/", requireRole(["ADMIN", "JEFE"]), createGranulometry);
router.get("/", listGranulometries);
router.get("/by-sample/:sampleId", getGranulometriesBySample);

router.post("/:id/recalculate", requireRole(["ADMIN", "JEFE"]), recalculateGranulometry);

// editar tamices + recalcular
router.put("/:id/sieves", requireRole(["ADMIN", "JEFE"]), updateGranulometrySieves);

// Aprobar granulometría (evento formal, separado de recalculate/sieves)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveGranulometry);

router.get("/:id", getGranulometryById);

export default router;
