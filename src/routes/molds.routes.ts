import { Router } from "express";
import {
  listMolds,
  getMoldById,
  createMold,
  updateMold,
  verifyMold,
} from "../controllers/molds.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.get("/", listMolds);
router.get("/:id", getMoldById);
router.post("/", requireRole(["ADMIN", "JEFE"]), createMold);
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updateMold);
// Verificacion interna periodica (3 meses, NORMATIVE). Renombrado de
// /calibrate a /verify: Mold no tiene calibracion externa acreditada.
router.post("/:id/verify", requireRole(["ADMIN", "JEFE"]), verifyMold);

export default router;
