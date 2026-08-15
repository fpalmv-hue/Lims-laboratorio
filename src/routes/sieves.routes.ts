import { Router } from "express";
import {
  listSieves,
  getSieveById,
  createSieve,
  updateSieve,
  verifySieve,
} from "../controllers/sieves.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.get("/ping", (_req, res) => res.json({ ok: true, route: "sieves" }));
router.get("/", listSieves);
router.get("/:id", getSieveById);
router.post("/", requireRole(["ADMIN", "JEFE"]), createSieve);
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updateSieve);
// Verificación interna periódica (6 meses). NO hay /calibrate: los tamices
// no tienen calibración externa acreditada (confirmado por Felipe).
router.post("/:id/verify", requireRole(["ADMIN", "JEFE"]), verifySieve);

export default router;
