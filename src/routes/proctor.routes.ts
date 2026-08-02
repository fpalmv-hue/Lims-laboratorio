import { Router } from "express";
import {
  createProctor,
  getProctorById,
  listProctorsBySample,
  addProctorPoint,
  listProctorPoints,
  recalculateProctor,
  approveProctor,
} from "../controllers/proctor.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "proctors" }));

// Crear proctor por muestra (como ya te funcionó)
router.post("/sample/:sampleId", createProctor);

// Listar proctors por muestra
router.get("/sample/:sampleId", listProctorsBySample);

// Obtener proctor
router.get("/:id", getProctorById);

// Puntos
router.post("/:id/points", addProctorPoint);
router.get("/:id/points", listProctorPoints);

// Recalcular (genera OMC/MDD + chartJson)
router.post("/:id/recalculate", recalculateProctor);

// Aprobar proctor (evento formal, separado de recalculate)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveProctor);

export default router;
