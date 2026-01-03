// src/routes/granulometry.routes.ts
import { Router } from "express";
import {
  createGranulometry,
  getGranulometryById,
  getGranulometriesBySample,
  listGranulometries,
  recalculateGranulometry,
  updateGranulometrySieves,
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

router.get("/:id", getGranulometryById);

export default router;
