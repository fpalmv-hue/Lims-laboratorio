// src/routes/users.routes.ts
 
import { Router } from "express";
import {
  getUsers,
  getUserById,
  createUser,
  updateUserRole,
} from "../controllers/users.controller";
import { requireRole } from "../middlewares/auth";
 
const router = Router();
 
// GET /users
router.get("/", getUsers);
 
// GET /users/:id
router.get("/:id", getUserById);
 
// POST /users
// FIX (auditoría 24-jul-2026): antes solo exigía estar logeado (requireAuth,
// ya aplicado globalmente en server.ts). Cualquier usuario autenticado podía
// crear usuarios nuevos. Ahora exige rol ADMIN.
router.post("/", requireRole("ADMIN"), createUser);
 
// PATCH /users/:id/role
// FIX (auditoría 24-jul-2026): mismo problema — cualquier usuario autenticado
// podía cambiar el rol de cualquier cuenta, incluida la propia (escalación
// de privilegios a ADMIN). Ahora exige rol ADMIN.
router.patch("/:id/role", requireRole("ADMIN"), updateUserRole);
 
export default router;