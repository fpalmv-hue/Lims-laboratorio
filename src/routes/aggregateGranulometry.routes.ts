import { Router } from "express";
import {
  createAggregateGranulometry,
  getAggregateGranulometryById,
  listAggregateGranulometriesBySample,
  approveAggregateGranulometry,
} from "../controllers/aggregateGranulometry.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "aggregate-granulometries" }));

// Crear por muestra (valida area HORMIGON)
router.post("/sample/:sampleId", createAggregateGranulometry);

// Listar por muestra
router.get("/sample/:sampleId", listAggregateGranulometriesBySample);

// Obtener
router.get("/:id", getAggregateGranulometryById);

// Aprobar (evento formal, separado de la creacion)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveAggregateGranulometry);

export default router;
