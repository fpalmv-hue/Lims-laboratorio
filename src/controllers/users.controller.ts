// src/controllers/users.controller.ts
import { Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

// GET /users - listar usuarios (sin password)
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      message: "Users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

// GET /users/:id - detalle (sin password)
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        message: "Invalid user ID. It must be a number.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: `User with ID ${userId} not found`,
      });
    }

    return res.json({
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

// POST /users - crear usuario (admin, jefe, etc.)
export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "name, email, password y role son obligatorios.",
      });
    }

    const validRoles = ["ADMIN", "JEFE", "LABORATORISTA", "CALIDAD", "AUDITOR"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        message: `role debe ser uno de: ${validRoles.join(", ")}`,
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(409).json({
        message: "Ya existe un usuario con ese email.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Trazabilidad ISO 17025: registrar la creación del usuario.
    // req.user siempre existe acá porque esta ruta está detrás de requireAuth.
    if (req.user) {
      await registerAudit({
        userId: req.user.id,
        action: "CREATE",
        entityType: "User",
        entityId: newUser.id,
        previousValue: null,
        newValue: newUser,
      });
    }

    return res.status(201).json({
      message: "User created successfully",
      data: newUser,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

// PATCH /users/:id/role - actualizar rol
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const { role, reason } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({
        message: "Invalid user ID. It must be a number.",
      });
    }

    if (!role) {
      return res.status(400).json({
        message: "Field 'role' is required.",
      });
    }

    const validRoles = ["ADMIN", "JEFE", "LABORATORISTA", "CALIDAD", "AUDITOR"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        message: `role debe ser uno de: ${validRoles.join(", ")}`,
      });
    }

    // Capturamos el estado ANTES de modificar, para el AuditLog.
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!before) {
      return res.status(404).json({
        message: `User with ID ${userId} not found`,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Trazabilidad ISO 17025: registrar el cambio de rol con valor
    // anterior y nuevo. El motivo (reason) es opcional por ahora a nivel
    // de validación -- la regla de "obligatorio si ya estaba aprobado"
    // se implementa cuando conectemos esto a resultados de ensayo.
    if (req.user) {
      await registerAudit({
        userId: req.user.id,
        action: "ROLE_CHANGE",
        entityType: "User",
        entityId: updatedUser.id,
        previousValue: before,
        newValue: updatedUser,
        reason,
      });
    }

    return res.json({
      message: "User role updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};
