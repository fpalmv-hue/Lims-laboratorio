import { Router } from "express";
import {
  listLosAngelesMachines,
  getLosAngelesMachineById,
  createLosAngelesMachine,
  updateLosAngelesMachine,
  verifyLosAngelesMachine,
} from "../controllers/losAngelesMachine.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.get("/ping", (_req, res) => res.json({ ok: true, route: "los-angeles-machines" }));
router.get("/", listLosAngelesMachines);
router.get("/:id", getLosAngelesMachineById);
router.post("/", requireRole(["ADMIN", "JEFE"]), createLosAngelesMachine);
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updateLosAngelesMachine);
// Verificación interna periódica (6 meses). NO hay /calibrate: sin
// calibración externa acreditada (confirmado por Felipe).
router.post("/:id/verify", requireRole(["ADMIN", "JEFE"]), verifyLosAngelesMachine);

export default router;
