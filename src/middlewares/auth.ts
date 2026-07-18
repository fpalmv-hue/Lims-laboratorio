// src/middlewares/auth.ts

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env";

export interface AuthUser {
  id: number;
  role: string;
  email?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware que valida el token JWT y deja el usuario en req.user
 */
export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader =
    (req.headers["authorization"] as string | undefined) ||
    (req.headers["Authorization"] as string | undefined);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Token missing or malformed" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);

    const sub = decoded.sub;
    const role = decoded.role;

    const userId =
      typeof sub === "string" ? parseInt(sub, 10) : (sub as number | undefined);

    if (!userId || !role) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid token payload" });
    }

    req.user = {
      id: userId,
      role: String(role),
      email: decoded.email,
    };

    next();
  } catch (err) {
    console.error("Error verifying JWT:", err);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

/**
 * Middleware de autorización por rol.
 *
 * Soporta:
 *  - requireRole("ADMIN")
 *  - requireRole("ADMIN", "JEFE")
 *  - requireRole(["ADMIN", "JEFE"])
 */
export const requireRole = (
  roles: string | string[],
  ...extraRoles: string[]
) => {
  const allowedRoles = Array.isArray(roles)
    ? roles
    : [roles, ...extraRoles];

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Token missing" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Forbidden: insufficient role" });
    }

    next();
  };
};
