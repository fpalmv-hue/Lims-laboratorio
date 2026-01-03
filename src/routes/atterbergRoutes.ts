import { Router } from "express";
import {
  createAtterberg,
  upsertAtterberg,
  getAtterbergBySample,
} from "../controllers/atterbergController";

const router = Router();

router.post("/samples/:sampleId/atterberg", createAtterberg);
router.put("/samples/:sampleId/atterberg", upsertAtterberg);
router.get("/samples/:sampleId/atterberg", getAtterbergBySample);

export default router;
