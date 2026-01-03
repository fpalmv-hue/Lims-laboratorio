// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prismaClient";

const JWT_SECRET = process.env.JWT_SECRET ?? "DEV_SUPER_SECRET_KEY";
const JWT_EXPIRES_IN = "8h";


export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email y password son obligatorios.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        message: "Credenciales inválidas (email o password incorrectos).",
      });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        message: "Credenciales inválidas (email o password incorrectos).",
      });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: "Login exitoso",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({
      message: "Error en login",
      error,
    });
  }
};
