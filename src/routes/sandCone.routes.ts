import { Router } from "express";
import {
  listSandCones,
  getSandConeById,
  createSandCone,
  updateSandCone,
  calibrateSandConeDeposit,
  calibrateSandConeSand,
  calibrateSandConeFunnel,
} from "../controllers/sandCone.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

// GET /api/sand-cones?active=true
router.get("/", listSandCones);

// GET /api/sand-cones/:id
router.get("/:id", getSandConeById);

// POST /api/sand-cones
router.post("/", requireRole(["ADMIN", "JEFE"]), createSandCone);

// PUT /api/sand-cones/:id
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updateSandCone);

// Calibraciones (tres eventos independientes -- ver NCh1516.Of79)
router.post("/:id/calibrate-deposit", requireRole(["ADMIN", "JEFE"]), calibrateSandConeDeposit);
router.post("/:id/calibrate-sand", requireRole(["ADMIN", "JEFE"]), calibrateSandConeSand);
router.post("/:id/calibrate-funnel", requireRole(["ADMIN", "JEFE"]), calibrateSandConeFunnel);

export default router;
