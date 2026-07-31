// src/controllers/orders.controller.ts
import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

// ----------------------------------------------------
// GET /api/orders
// ----------------------------------------------------
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.json({ message: "OK", data: orders });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ----------------------------------------------------
// GET /api/orders/:id
// ----------------------------------------------------
export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    return res.json({ message: "OK", data: order });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ----------------------------------------------------
// POST /api/orders
// ----------------------------------------------------
export const postOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { client, sampleType, testRequested } = req.body;

    if (!client || !sampleType || !testRequested) {
      return res.status(400).json({
        message: "client, sampleType y testRequested son obligatorios",
      });
    }

    const order = await prisma.order.create({
      data: { client, sampleType, testRequested },
    });

    // Trazabilidad ISO 17025: registrar la creación de la orden.
    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Order",
      entityId: order.id,
      previousValue: null,
      newValue: order,
    });

    return res.status(201).json({
      message: "Orden creada correctamente",
      data: order,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
