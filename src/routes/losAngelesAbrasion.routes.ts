import { Router } from "express";
import {
  createLosAngelesAbrasion,
  getLosAngelesAbrasionById,
  listLosAngelesAbrasionsBySample,
  approveLosAngelesAbrasion,
} from "../controllers/losAngelesAbrasion.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "los-angeles-abrasions" }));

// Crear por muestra (valida area HORMIGON)
router.post("/sample/:sampleId", createLosAngelesAbrasion);

// Listar por muestra
router.get("/sample/:sampleId", listLosAngelesAbrasionsBySample);

// Obtener
router.get("/:id", getLosAngelesAbrasionById);

// Aprobar (evento formal, separado de la creacion)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveLosAngelesAbrasion);

export default router;
