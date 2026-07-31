import { Router } from "express";
import { getOrders, getOrderById, postOrder } from "../controllers/orders.controller";

const router = Router();

// Listar órdenes
router.get("/", getOrders);

// Obtener una orden por id
router.get("/:id", getOrderById);

// Crear nueva orden
router.post("/", postOrder);

export default router;
