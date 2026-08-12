import { Router } from "express";
import {
  createCbr,
  getCbrById,
  listCbrsBySample,
  addCbrPoint,
  listCbrPoints,
  recalculateCbr,
  approveCbr,
} from "../controllers/cbr.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "cbrs" }));

// Crear CBR por muestra
router.post("/sample/:sampleId", createCbr);

// Listar CBR por muestra
router.get("/sample/:sampleId", listCbrsBySample);

// Obtener CBR
router.get("/:id", getCbrById);

// Puntos
router.post("/:id/points", addCbrPoint);
router.get("/:id/points", listCbrPoints);

// Recalcular (genera designCbrPercent + curveJson)
router.post("/:id/recalculate", recalculateCbr);

// Aprobar CBR (evento formal, separado de recalculate)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveCbr);

export default router;
