// src/controllers/cbr.controller.ts
import type { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  addCbrPointService,
  createCbrService,
  getCbrByIdService,
  listCbrPointsService,
  listCbrsBySampleService,
  recalculateCbrService,
  approveCbrService,
} from "../services/cbr.service";

export async function createCbr(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createCbrService({ sampleIdRaw, body: req.body, userId });
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

export async function getCbrById(req: AuthRequest, res: Response) {
  try {
    const out = await getCbrByIdService(req.params.id);
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

export async function listCbrsBySample(req: AuthRequest, res: Response) {
  try {
    const out = await listCbrsBySampleService(req.params.sampleId);
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

export async function addCbrPoint(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await addCbrPointService({
      cbrIdRaw: req.params.id,
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

export async function listCbrPoints(req: AuthRequest, res: Response) {
  try {
    const out = await listCbrPointsService(req.params.id);
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

export async function recalculateCbr(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await recalculateCbrService(req.params.id, userId, req.body?.reason);
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

export async function approveCbr(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const out = await approveCbrService(req.params.id, userId, req.body?.reason);
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
