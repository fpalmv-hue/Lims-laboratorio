import { Router } from "express";
import {
  createGravelDensity,
  getGravelDensityById,
  listGravelDensitiesBySample,
  updateGravelDensity,
  approveGravelDensity,
} from "../controllers/gravelDensity.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (req, res) => res.json({ ok: true, route: "gravel-densities" }));

// Crear por muestra (valida area SOIL_MECHANICS o HORMIGON)
router.post("/sample/:sampleId", createGravelDensity);

// Listar por muestra
router.get("/sample/:sampleId", listGravelDensitiesBySample);

// Obtener
router.get("/:id", getGravelDensityById);

// Editar (revierte isApproved si ya estaba aprobado, exige reason)
router.put("/:id", updateGravelDensity);

// Aprobar (evento formal, separado de update)
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveGravelDensity);

export default router;
