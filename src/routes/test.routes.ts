// src/routes/test.routes.ts
import { Router } from "express";
import {
  createTest,
  listTests,
  getTestById,
  updateTest,
} from "../controllers/test.controller";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

// Todas estas rutas requieren estar autenticado
router.use(requireAuth);

// Crear ensayo: solo ADMIN
router.post("/", requireRole("ADMIN"), createTest);

// Listar ensayos (con filtros opcionales, si los definimos en el controller)
router.get("/", listTests);

// Ver detalle de un ensayo
router.get("/:id", getTestById);

// Actualizar ensayo: solo ADMIN
router.put("/:id", requireRole("ADMIN"), updateTest);

export default router;
