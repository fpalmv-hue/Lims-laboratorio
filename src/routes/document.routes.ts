// src/routes/document.routes.ts
import { Router } from "express";
import {
  createDocument,
  getDocumentById,
  getDocumentByCode,
  listDocuments,
  updateDocument,
  approveDocument,
  obsoleteDocument,
} from "../controllers/document.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

// Lectura: cualquier usuario autenticado (cualquiera debe poder
// consultar "cual es el procedimiento vigente").
router.get("/", listDocuments);
router.get("/by-code/:code", getDocumentByCode);
router.get("/:id", getDocumentById);

// Escritura: gestion de calidad (ADMIN/JEFE/CALIDAD), no tecnico de
// laboratorio -- control documental es funcion de calidad, no de
// ejecucion de ensayos.
router.post("/", requireRole(["ADMIN", "JEFE", "CALIDAD"]), createDocument);
router.put("/:id", requireRole(["ADMIN", "JEFE", "CALIDAD"]), updateDocument);
router.post("/:id/approve", requireRole(["ADMIN", "JEFE", "CALIDAD"]), approveDocument);
router.post("/:id/obsolete", requireRole(["ADMIN", "JEFE", "CALIDAD"]), obsoleteDocument);

export default router;
