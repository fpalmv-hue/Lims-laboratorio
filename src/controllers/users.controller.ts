// src/controllers/users.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../prismaClient";

// GET /users - listar usuarios (sin password)
export const getUsers = async (req: Request, res: Response) => {
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
      message: "Error fetching users",
      error,
    });
  }
};

// GET /users/:id - detalle (sin password)
export const getUserById = async (req: Request, res: Response) => {
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
      message: "Error fetching user",
      error,
    });
  }
};

// POST /users - crear usuario (admin, jefe, etc.)
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "name, email, password y role son obligatorios.",
      });
    }

    // Validación simple del rol (opcional)
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

    return res.status(201).json({
      message: "User created successfully",
      data: newUser,
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    return res.status(500).json({
      message: "Error creating user",
      error: error.meta ?? error.message ?? error,
    });
  }
};

// PATCH /users/:id/role - actualizar rol
export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const { role } = req.body;

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

    return res.json({
      message: "User role updated successfully",
      data: updatedUser,
    });
  } catch (error: any) {
    console.error("Error updating user role:", error);
    return res.status(500).json({
      message: "Error updating user role",
      error: error.meta ?? error.message ?? error,
    });
  }
};
