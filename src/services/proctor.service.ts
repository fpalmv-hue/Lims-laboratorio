// src/services/proctor.service.ts
//
// Reescrito para exportar exactamente las funciones que
// proctor.controller.ts importa. Antes, el controller importaba
// createProctorService / getProctorByIdService / listProctorsBySampleService /
// addProctorPointService / listProctorPointsService / recalculateProctorService,
// pero este archivo exportaba nombres y firmas distintos
// (createProctorForSample, getProctorFull, addPointToProctor, etc.) —
// el proyecto no compilaba.
//
// Convención de retorno: cada función devuelve { data } en éxito o
// { error: { status, message } } en fallo, que es lo que el controller
// ya sabe interpretar.

import prisma from "../prismaClient";
import { calculateProctorFromDb } from "../utils/proctorCalc";

type ServiceError = { error: { status: number; message: string } };
type ServiceOk<T> = { data: T };
type ServiceResult<T> = ServiceOk<T> | ServiceError;

function err(status: number, message: string): ServiceError {
  return { error: { status, message } };
}

function parseId(raw: unknown, label: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ---------------------------------------------------------------------
// POST /api/proctors/sample/:sampleId  (o POST /api/proctors con sampleId en body)
// ---------------------------------------------------------------------
export async function createProctorService(params: {
  sampleIdRaw: unknown;
  body: {
    methodCode?: string | null;
    methodName?: string | null;
    layers?: number | null;
    blowsPerLayer?: number | null;
    notes?: string | null;
  };
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw, "sampleId");
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const { methodCode, methodName, layers, blowsPerLayer, notes } = params.body ?? {};

  const proctor = await prisma.proctor.create({
    data: {
      sampleId,
      methodCode: methodCode ?? null,
      methodName: methodName ?? null,
      layers: layers ?? null,
      blowsPerLayer: blowsPerLayer ?? null,
      notes: notes ?? null,
      status: "DRAFT",
      curveFit: "PARABOLA",
    },
  });

  return { data: proctor };
}

// ---------------------------------------------------------------------
// GET /api/proctors/:id
// ---------------------------------------------------------------------
export async function getProctorByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw, "id");
  if (!id) return err(400, "id inválido.");

  const proctor = await prisma.proctor.findUnique({
    where: { id },
    include: {
      points: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { mold: true } },
    },
  });

  if (!proctor) return err(404, "Proctor no encontrado.");
  return { data: proctor };
}

// ---------------------------------------------------------------------
// GET /api/proctors/sample/:sampleId
// ---------------------------------------------------------------------
export async function listProctorsBySampleService(
  sampleIdRaw: unknown
): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw, "sampleId");
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const proctors = await prisma.proctor.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });

  return { data: proctors };
}

// ---------------------------------------------------------------------
// POST /api/proctors/:id/points
// ---------------------------------------------------------------------
export async function addProctorPointService(params: {
  proctorIdRaw: unknown;
  body: {
    order?: number | null;
    moldId: number;
    wetMassMoldPlusSoilG: number;
    waterContentPercent: number;
  };
}): Promise<ServiceResult<any>> {
  const proctorId = parseId(params.proctorIdRaw, "id");
  if (!proctorId) return err(400, "id de proctor inválido.");

  const { moldId, wetMassMoldPlusSoilG, waterContentPercent } = params.body ?? ({} as any);

  if (!Number.isFinite(Number(moldId))) return err(400, "moldId es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(wetMassMoldPlusSoilG))) {
    return err(400, "wetMassMoldPlusSoilG es obligatorio y debe ser numérico.");
  }
  if (!Number.isFinite(Number(waterContentPercent))) {
    return err(400, "waterContentPercent es obligatorio y debe ser numérico.");
  }

  const proctor = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!proctor) return err(404, "Proctor no encontrado.");

  const mold = await prisma.mold.findUnique({ where: { id: Number(moldId) } });
  if (!mold) return err(404, "Molde no encontrado.");
  if (mold.tareMassG === null || mold.tareMassG === undefined) {
    return err(400, "El molde seleccionado no tiene tara registrada (tareMassG).");
  }

  let order = params.body.order ?? null;
  if (!order) {
    const count = await prisma.proctorPoint.count({ where: { proctorId } });
    order = count + 1;
  }

  const point = await prisma.proctorPoint.create({
    data: {
      proctorId,
      order,
      moldId: Number(moldId),
      wetMassMoldPlusSoilG: Number(wetMassMoldPlusSoilG),
      waterContentPercent: Number(waterContentPercent),
    },
  });

  return { data: point };
}

// ---------------------------------------------------------------------
// GET /api/proctors/:id/points
// ---------------------------------------------------------------------
export async function listProctorPointsService(
  proctorIdRaw: unknown
): Promise<ServiceResult<any>> {
  const proctorId = parseId(proctorIdRaw, "id");
  if (!proctorId) return err(400, "id de proctor inválido.");

  const proctor = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!proctor) return err(404, "Proctor no encontrado.");

  const points = await prisma.proctorPoint.findMany({
    where: { proctorId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { mold: true },
  });

  return { data: points };
}

// ---------------------------------------------------------------------
// POST /api/proctors/:id/recalculate
// ---------------------------------------------------------------------
export async function recalculateProctorService(
  proctorIdRaw: unknown
): Promise<ServiceResult<any>> {
  const proctorId = parseId(proctorIdRaw, "id");
  if (!proctorId) return err(400, "id de proctor inválido.");

  const existing = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!existing) return err(404, "Proctor no encontrado.");

  const calc = await calculateProctorFromDb(proctorId);

  const updated = await prisma.proctor.update({
    where: { id: proctorId },
    data: {
      omcPercent: calc.omcPercent,
      mddDryDensity: calc.mddDryDensity,
      chartJson: calc.chartJson as any,
    },
  });

  return { data: { proctor: updated, calc } };
}
