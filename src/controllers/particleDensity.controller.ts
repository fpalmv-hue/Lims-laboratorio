// src/controllers/particleDensity.controller.ts
import type { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  createParticleDensityService,
  getParticleDensityByIdService,
  listParticleDensitiesBySampleService,
  updateParticleDensityService,
  recalculateParticleDensityService,
  approveParticleDensityService,
} from "../services/particleDensity.service";

export async function createParticleDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createParticleDensityService({ sampleIdRaw, body: req.body, userId });
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    const warning = (out as any).warning;
    return res
      .status(201)
      .json({ message: "OK", data: (out as any).data, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function getParticleDensityById(req: AuthRequest, res: Response) {
  try {
    const out = await getParticleDensityByIdService(req.params.id);
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

export async function listParticleDensitiesBySample(req: AuthRequest, res: Response) {
  try {
    const out = await listParticleDensitiesBySampleService(req.params.sampleId);
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

export async function updateParticleDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await updateParticleDensityService({
      idRaw: req.params.id,
      body: req.body,
      userId,
    });
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    const warning = (out as any).warning;
    return res.json({ message: "OK", data: (out as any).data, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function recalculateParticleDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await recalculateParticleDensityService(req.params.id, userId, req.body?.reason);
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

export async function approveParticleDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await approveParticleDensityService(req.params.id, userId, req.body?.reason);
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
