// src/controllers/aggregateGranulometry.controller.ts
import type { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  createAggregateGranulometryService,
  getAggregateGranulometryByIdService,
  listAggregateGranulometriesBySampleService,
  approveAggregateGranulometryService,
} from "../services/aggregateGranulometry.service";

export async function createAggregateGranulometry(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createAggregateGranulometryService({ sampleIdRaw, body: req.body, userId });
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

export async function getAggregateGranulometryById(req: AuthRequest, res: Response) {
  try {
    const out = await getAggregateGranulometryByIdService(req.params.id);
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

export async function listAggregateGranulometriesBySample(req: AuthRequest, res: Response) {
  try {
    const out = await listAggregateGranulometriesBySampleService(req.params.sampleId);
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

export async function approveAggregateGranulometry(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await approveAggregateGranulometryService(req.params.id, userId, req.body?.reason);
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
