import { Router } from "express";
import {
  createEquipment,
  listEquipment,
  listEquipmentDueSoon,
  getEquipmentById,
  updateEquipment,
  verifyEquipment,
  calibrateEquipment,
} from "../controllers/equipment.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (_req, res) => res.json({ ok: true, route: "equipment" }));

// GET /api/equipment/due-soon?days=N — ANTES de /:id para que no colisione
router.get("/due-soon", listEquipmentDueSoon);

// CRUD
router.get("/", listEquipment);
router.get("/:id", getEquipmentById);
router.post("/", requireRole(["ADMIN", "JEFE", "CALIDAD"]), createEquipment);
router.put("/:id", requireRole(["ADMIN", "JEFE", "CALIDAD"]), updateEquipment);

// Eventos de calidad
router.post("/:id/verify", requireRole(["ADMIN", "JEFE", "CALIDAD"]), verifyEquipment);
router.post("/:id/calibrate", requireRole(["ADMIN", "JEFE", "CALIDAD"]), calibrateEquipment);

export default router;
