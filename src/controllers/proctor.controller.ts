// src/controllers/proctor.controller.ts
import type { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  addProctorPointService,
  createProctorService,
  getProctorByIdService,
  listProctorPointsService,
  listProctorsBySampleService,
  recalculateProctorService,
} from "../services/proctor.service";

export async function createProctor(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    // ✅ acepta sampleId por URL params o por body
    //   - POST /api/proctors/sample/:sampleId  -> params
    //   - POST /api/proctors                  -> body
    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createProctorService({ sampleIdRaw, body: req.body, userId });
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

export async function getProctorById(req: AuthRequest, res: Response) {
  try {
    const out = await getProctorByIdService(req.params.id);
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

export async function listProctorsBySample(req: AuthRequest, res: Response) {
  try {
    const out = await listProctorsBySampleService(req.params.sampleId);
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

export async function addProctorPoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await addProctorPointService({
      proctorIdRaw: req.params.id,
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

export async function listProctorPoints(req: AuthRequest, res: Response) {
  try {
    const out = await listProctorPointsService(req.params.id);
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

export async function recalculateProctor(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await recalculateProctorService(req.params.id, userId);
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
