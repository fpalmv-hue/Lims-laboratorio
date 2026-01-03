import { Router } from "express";
import { listMolds } from "../controllers/molds.controller";

const router = Router();

// GET /api/molds?active=true
router.get("/", listMolds);

export default router;
