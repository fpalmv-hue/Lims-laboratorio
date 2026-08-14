// src/controllers/gravelDensity.controller.ts
import type { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  createGravelDensityService,
  getGravelDensityByIdService,
  listGravelDensitiesBySampleService,
  updateGravelDensityService,
  approveGravelDensityService,
} from "../services/gravelDensity.service";

export async function createGravelDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createGravelDensityService({ sampleIdRaw, body: req.body, userId });
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

export async function getGravelDensityById(req: AuthRequest, res: Response) {
  try {
    const out = await getGravelDensityByIdService(req.params.id);
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

export async function listGravelDensitiesBySample(req: AuthRequest, res: Response) {
  try {
    const out = await listGravelDensitiesBySampleService(req.params.sampleId);
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

export async function updateGravelDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await updateGravelDensityService({
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

export async function approveGravelDensity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await approveGravelDensityService(req.params.id, userId, req.body?.reason);
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
