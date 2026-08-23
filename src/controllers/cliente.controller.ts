// src/controllers/cliente.controller.ts
//
// Fase 7: catálogo de clientes (base de autenticación/roles y futuro
// portal cliente, Fase 9). CRUD básico, sin borrado (mismo criterio que
// el resto de los catálogos administrativos del sistema -- baja lógica
// si en el futuro hace falta, no DELETE físico).
import type { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

// ----------------------------------------------------
// GET /api/clientes
// ----------------------------------------------------
export async function listClientes(req: AuthRequest, res: Response) {
  try {
    const clientes = await prisma.cliente.findMany({
      orderBy: { nombre: "asc" },
    });

    return res.json({ message: "OK", data: clientes });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// GET /api/clientes/:id
// ----------------------------------------------------
export async function getClienteById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "id inválido." });
    }

    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) return res.status(404).json({ message: "Cliente no encontrado." });

    return res.json({ message: "OK", data: cliente });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/clientes
// Body: { nombre, estadoCuentaAlDia? }
// ----------------------------------------------------
export async function createCliente(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const { nombre, estadoCuentaAlDia } = req.body as {
      nombre?: string;
      estadoCuentaAlDia?: boolean;
    };

    if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
      return res.status(400).json({ message: "nombre es obligatorio." });
    }
    if (estadoCuentaAlDia !== undefined && typeof estadoCuentaAlDia !== "boolean") {
      return res.status(400).json({ message: "estadoCuentaAlDia debe ser boolean." });
    }

    const cliente = await prisma.cliente.create({
      data: {
        nombre: nombre.trim(),
        ...(estadoCuentaAlDia !== undefined ? { estadoCuentaAlDia } : {}),
      },
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Cliente",
      entityId: cliente.id,
      previousValue: null,
      newValue: cliente,
    });

    return res.status(201).json({ message: "Cliente creado", data: cliente });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/clientes/:id
// Body: { nombre?, estadoCuentaAlDia?, reason? }
// ----------------------------------------------------
export async function updateCliente(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "id inválido." });
    }

    const { nombre, estadoCuentaAlDia, reason } = req.body as {
      nombre?: string;
      estadoCuentaAlDia?: boolean;
      reason?: string;
    };

    if (nombre !== undefined && (typeof nombre !== "string" || !nombre.trim())) {
      return res.status(400).json({ message: "nombre no puede quedar vacío." });
    }
    if (estadoCuentaAlDia !== undefined && typeof estadoCuentaAlDia !== "boolean") {
      return res.status(400).json({ message: "estadoCuentaAlDia debe ser boolean." });
    }

    const before = await prisma.cliente.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Cliente no encontrado." });

    const data: { nombre?: string; estadoCuentaAlDia?: boolean } = {};
    if (nombre !== undefined) data.nombre = nombre.trim();
    if (estadoCuentaAlDia !== undefined) data.estadoCuentaAlDia = estadoCuentaAlDia;

    const updated = await prisma.cliente.update({ where: { id }, data });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Cliente",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.json({ message: "Cliente actualizado", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Cliente no encontrado." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
