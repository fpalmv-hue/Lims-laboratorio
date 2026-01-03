// src/controllers/proctor.controller.ts
import type { Request, Response } from "express";
import {
  addProctorPointService,
  createProctorService,
  getProctorByIdService,
  listProctorPointsService,
  listProctorsBySampleService,
  recalculateProctorService,
} from "../services/proctor.service";

export async function createProctor(req: Request, res: Response) {
  try {
    // ✅ acepta sampleId por URL params o por body
    //   - POST /api/proctors/sample/:sampleId  -> params
    //   - POST /api/proctors                  -> body
    const sampleIdRaw = req.params.sampleId ?? req.body.sampleId;

    const out = await createProctorService({ sampleIdRaw, body: req.body });
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    return res.status(500).json({ message: "Error", error: String(err?.message ?? err) });
  }
}

export async function getProctorById(req: Request, res: Response) {
  try {
    const out = await getProctorByIdService(req.params.id);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    return res.status(500).json({ message: "Error", error: String(err?.message ?? err) });
  }
}

export async function listProctorsBySample(req: Request, res: Response) {
  try {
    const out = await listProctorsBySampleService(req.params.sampleId);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    return res.status(500).json({ message: "Error", error: String(err?.message ?? err) });
  }
}

export async function addProctorPoint(req: Request, res: Response) {
  try {
    const out = await addProctorPointService({
      proctorIdRaw: req.params.id,
      body: req.body,
    });
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    return res.status(500).json({ message: "Error", error: String(err?.message ?? err) });
  }
}

export async function listProctorPoints(req: Request, res: Response) {
  try {
    const out = await listProctorPointsService(req.params.id);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    return res.status(500).json({ message: "Error", error: String(err?.message ?? err) });
  }
}

export async function recalculateProctor(req: Request, res: Response) {
  try {
    const out = await recalculateProctorService(req.params.id);
    if ((out as any).error) {
      const e = (out as any).error;
      return res.status(e.status).json({ message: e.message });
    }
    return res.json({ message: "OK", data: (out as any).data });
  } catch (err: any) {
    return res.status(500).json({ message: "Error", error: String(err?.message ?? err) });
  }
}
