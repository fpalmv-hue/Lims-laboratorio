// src/routes/auth.routes.ts

import { Router } from "express";
import { login } from "../controllers/auth.controller";

const router = Router();

// POST /auth/login
router.post("/login", login);

export default router;
