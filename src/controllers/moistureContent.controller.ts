// src/controllers/moistureContent.controller.ts
import type { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  createMoistureContentService,
  getMoistureContentByIdService,
  listMoistureContentsBySampleService,
  updateMoistureContentService,
  recalculateMoistureContentService,
  approveMoistureContentService,
} from "../services/moistureContent.service";

export async function createMoistureContent(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createMoistureContentService({ sampleIdRaw, body: req.body, userId });
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.status(201).json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function getMoistureContentById(req: AuthRequest, res: Response) {
  try {
    const out = await getMoistureContentByIdService(req.params.id);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function listMoistureContentsBySample(req: AuthRequest, res: Response) {
  try {
    const out = await listMoistureContentsBySampleService(req.params.sampleId);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function updateMoistureContent(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await updateMoistureContentService({
      idRaw: req.params.id,
      body: req.body,
      userId,
    });
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function recalculateMoistureContent(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await recalculateMoistureContentService(req.params.id, userId, req.body?.reason);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function approveMoistureContent(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await approveMoistureContentService(req.params.id, userId, req.body?.reason);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
