import { Router } from "express";
import {
  listPycnometers,
  getPycnometerById,
  createPycnometer,
  updatePycnometer,
  calibratePycnometer,
} from "../controllers/pycnometer.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

// GET /api/pycnometers?active=true
router.get("/", listPycnometers);

// GET /api/pycnometers/:id
router.get("/:id", getPycnometerById);

// POST /api/pycnometers
router.post("/", requireRole(["ADMIN", "JEFE"]), createPycnometer);

// PUT /api/pycnometers/:id
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updatePycnometer);

// POST /api/pycnometers/:id/calibrate
router.post("/:id/calibrate", requireRole(["ADMIN", "JEFE"]), calibratePycnometer);

export default router;
