// src/routes/users.routes.ts

import { Router } from "express";
import {
  getUsers,
  getUserById,
  createUser,
  updateUserRole,
} from "../controllers/users.controller";

const router = Router();

// GET /users
router.get("/", getUsers);

// GET /users/:id
router.get("/:id", getUserById);

// POST /users
router.post("/", createUser);

// PATCH /users/:id/role
router.patch("/:id/role", updateUserRole);

export default router;
