import { Router } from "express";
import {
  listMolds,
  getMoldById,
  createMold,
  updateMold,
  calibrateMold,
} from "../controllers/molds.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

// GET /api/molds?active=true
router.get("/", listMolds);

// GET /api/molds/:id
router.get("/:id", getMoldById);

// POST /api/molds
router.post("/", requireRole(["ADMIN", "JEFE"]), createMold);

// PUT /api/molds/:id
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updateMold);

// POST /api/molds/:id/calibrate
router.post("/:id/calibrate", requireRole(["ADMIN", "JEFE"]), calibrateMold);

export default router;
