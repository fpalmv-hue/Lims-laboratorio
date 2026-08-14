// src/services/cbr.service.ts
//
// CBR (Indice de Soporte California), NCh1852.Of81. Mismo patron que
// proctor.service.ts: convencion de retorno { data } | { error }, guard
// de area (SOIL_MECHANICS), registerAudit() en cada escritura,
// assertReasonIfApproved/approvalResetIfNeeded en cada edicion.
//
// Particularidad de CBR: depende de un Proctor ya existente de la misma
// muestra (referencia de DMCS para el CBR de diseno al 95%).

import prisma from "../prismaClient";
import { calculateCbrFromDb } from "../utils/cbrCalc";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";
import { assertEquipmentUsable } from "../utils/equipmentGuard";

type ServiceError = { error: { status: number; message: string } };
type ServiceOk<T> = { data: T };
type ServiceResult<T> = ServiceOk<T> | ServiceError;

function err(status: number, message: string): ServiceError {
  return { error: { status, message } };
}

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ---------------------------------------------------------------------
// POST /api/cbrs/sample/:sampleId  (o POST /api/cbrs con sampleId en body)
// ---------------------------------------------------------------------
export async function createCbrService(params: {
  sampleIdRaw: unknown;
  body: {
    proctorId?: number | string;
    methodCode?: string | null;
    notes?: string | null;
    equipmentIds?: number[];
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw);
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  if (sample.area !== "SOIL_MECHANICS") {
    return err(
      400,
      `CBR es un ensayo de mecanica de suelos (SOIL_MECHANICS). La muestra ${sample.code} pertenece al area ${sample.area}.`
    );
  }

  const proctorId = parseId(params.body?.proctorId);
  if (!proctorId) return err(400, "proctorId es obligatorio y debe ser numérico.");

  const proctor = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!proctor) return err(404, "Proctor no encontrado.");
  if (proctor.sampleId !== sampleId) {
    return err(400, "El Proctor indicado no pertenece a esta muestra.");
  }

  // Guard ISO 17025: mismo aviso que Proctor -- moldes reales bloquearan
  // hasta que se registre una verificacion real via POST /api/molds/:id/verify.
  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const { methodCode, notes } = params.body ?? {};

  const cbr = await prisma.$transaction(async (tx) => {
    const c = await tx.cbr.create({
      data: {
        sampleId,
        proctorId,
        methodCode: methodCode ?? "NCh1852.Of81",
        notes: notes ?? null,
        status: "DRAFT",
      },
    });
    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "CBR",
          entityId: c.id,
        })),
      });
    }
    return c;
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "Cbr",
    entityId: cbr.id,
    previousValue: null,
    newValue: { ...cbr, equipmentIds },
  });

  return { data: cbr };
}

// ---------------------------------------------------------------------
// GET /api/cbrs/:id
// ---------------------------------------------------------------------
export async function getCbrByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const cbr = await prisma.cbr.findUnique({
    where: { id },
    include: {
      proctor: true,
      points: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { mold: { include: { equipment: true } } } },
    },
  });

  if (!cbr) return err(404, "CBR no encontrado.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "CBR", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...cbr, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/cbrs/sample/:sampleId
// ---------------------------------------------------------------------
export async function listCbrsBySampleService(sampleIdRaw: unknown): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const cbrs = await prisma.cbr.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });

  return { data: cbrs };
}

// ---------------------------------------------------------------------
// POST /api/cbrs/:id/points
// ---------------------------------------------------------------------
export async function addCbrPointService(params: {
  cbrIdRaw: unknown;
  body: {
    order?: number | null;
    moldId: number;
    blowsPerLayer: number;
    layers?: number | null;
    wetMassMoldPlusSoilG: number;
    waterContentPercent?: number | null;
    swellInitialDialMm?: number | null;
    swellFinalDialMm?: number | null;
    loadAt01inKgCm2?: number | null;
    loadAt02inKgCm2?: number | null;
    reason?: string;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const cbrId = parseId(params.cbrIdRaw);
  if (!cbrId) return err(400, "id de CBR inválido.");

  const {
    moldId,
    blowsPerLayer,
    layers,
    wetMassMoldPlusSoilG,
    waterContentPercent,
    swellInitialDialMm,
    swellFinalDialMm,
    loadAt01inKgCm2,
    loadAt02inKgCm2,
  } = params.body ?? ({} as any);

  if (!Number.isFinite(Number(moldId))) return err(400, "moldId es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(blowsPerLayer))) {
    return err(400, "blowsPerLayer es obligatorio y debe ser numérico.");
  }
  if (!Number.isFinite(Number(wetMassMoldPlusSoilG))) {
    return err(400, "wetMassMoldPlusSoilG es obligatorio y debe ser numérico.");
  }

  const cbr = await prisma.cbr.findUnique({ where: { id: cbrId } });
  if (!cbr) return err(404, "CBR no encontrado.");

  // Regla ISO 17025: agregar un punto a un CBR ya aprobado invalida esa
  // aprobación -- reason obligatorio, y el CBR padre revierte isApproved.
  const guardMsg = assertReasonIfApproved(cbr.isApproved, params.body.reason);
  if (guardMsg) return err(400, guardMsg);

  const mold = await prisma.mold.findUnique({ where: { id: Number(moldId) } });
  if (!mold) return err(404, "Molde no encontrado.");
  if (mold.tareMassG === null || mold.tareMassG === undefined) {
    return err(400, "El molde seleccionado no tiene tara registrada (tareMassG).");
  }

  let order = params.body.order ?? null;
  if (!order) {
    const count = await prisma.cbrPoint.count({ where: { cbrId } });
    order = count + 1;
  }

  const point = await prisma.cbrPoint.create({
    data: {
      cbrId,
      order,
      moldId: Number(moldId),
      blowsPerLayer: Number(blowsPerLayer),
      layers: layers ?? 5,
      wetMassMoldPlusSoilG: Number(wetMassMoldPlusSoilG),
      waterContentPercent: waterContentPercent ?? null,
      swellInitialDialMm: swellInitialDialMm ?? null,
      swellFinalDialMm: swellFinalDialMm ?? null,
      loadAt01inKgCm2: loadAt01inKgCm2 ?? null,
      loadAt02inKgCm2: loadAt02inKgCm2 ?? null,
    },
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "CbrPoint",
    entityId: point.id,
    previousValue: null,
    newValue: point,
    reason: params.body.reason,
  });

  if (cbr.isApproved) {
    const revertedCbr = await prisma.cbr.update({
      where: { id: cbrId },
      data: approvalResetIfNeeded(cbr.isApproved),
    });

    await registerAudit({
      userId: params.userId,
      action: "UPDATE",
      entityType: "Cbr",
      entityId: cbrId,
      previousValue: cbr,
      newValue: revertedCbr,
      reason: params.body.reason,
    });
  }

  return { data: point };
}

// ---------------------------------------------------------------------
// GET /api/cbrs/:id/points
// ---------------------------------------------------------------------
export async function listCbrPointsService(cbrIdRaw: unknown): Promise<ServiceResult<any>> {
  const cbrId = parseId(cbrIdRaw);
  if (!cbrId) return err(400, "id de CBR inválido.");

  const cbr = await prisma.cbr.findUnique({ where: { id: cbrId } });
  if (!cbr) return err(404, "CBR no encontrado.");

  const points = await prisma.cbrPoint.findMany({
    where: { cbrId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { mold: true },
  });

  return { data: points };
}

// ---------------------------------------------------------------------
// POST /api/cbrs/:id/recalculate
// ---------------------------------------------------------------------
export async function recalculateCbrService(
  cbrIdRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const cbrId = parseId(cbrIdRaw);
  if (!cbrId) return err(400, "id de CBR inválido.");

  const existing = await prisma.cbr.findUnique({ where: { id: cbrId } });
  if (!existing) return err(404, "CBR no encontrado.");

  const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
  if (guardMsg) return err(400, guardMsg);

  const calc = await calculateCbrFromDb(cbrId);

  const updated = await prisma.cbr.update({
    where: { id: cbrId },
    data: {
      designCbrPercent: calc.designCbrPercent,
      curveJson: calc.curveJson as any,
      status: calc.designCbrPercent !== null ? "DONE" : "NEEDS_REVIEW",
      ...approvalResetIfNeeded(existing.isApproved),
    },
  });

  await registerAudit({
    userId,
    action: "UPDATE",
    entityType: "Cbr",
    entityId: updated.id,
    previousValue: existing,
    newValue: updated,
    reason,
  });

  return { data: { cbr: updated, calc } };
}

// ---------------------------------------------------------------------
// POST /api/cbrs/:id/approve
// ---------------------------------------------------------------------
export async function approveCbrService(
  cbrIdRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const cbrId = parseId(cbrIdRaw);
  if (!cbrId) return err(400, "id de CBR inválido.");

  const before = await prisma.cbr.findUnique({ where: { id: cbrId } });
  if (!before) return err(404, "CBR no encontrado.");

  if (before.isApproved) return err(409, "Este CBR ya estaba aprobado.");

  const updated = await prisma.cbr.update({
    where: { id: cbrId },
    data: {
      isApproved: true,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });

  await registerAudit({
    userId,
    action: "APPROVE",
    entityType: "Cbr",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
