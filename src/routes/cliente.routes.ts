import { Router } from "express";
import {
  listClientes,
  getClienteById,
  createCliente,
  updateCliente,
} from "../controllers/cliente.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/ping", (_req, res) => res.json({ ok: true, route: "clientes" }));
router.get("/", listClientes);
router.get("/:id", getClienteById);
router.post("/", requireRole(["ADMIN", "JEFE"]), createCliente);
router.put("/:id", requireRole(["ADMIN", "JEFE"]), updateCliente);

export default router;
