import { Router } from "express";
import { getOrders, postOrder } from "../controllers/orders.controller";

const router = Router();

// Listar órdenes
router.get("/", getOrders);

// Crear nueva orden
router.post("/", postOrder);

export default router;
