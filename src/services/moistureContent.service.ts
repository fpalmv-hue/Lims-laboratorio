// src/services/moistureContent.service.ts
//
// Determinacion de Humedad, MC Vol.8 §8.102.2 (jun-2022, adaptacion de
// NCh1515-79). Mismo patron que particleDensity.service.ts: registro
// "plano" (mr, mh, ms, dryingTempC se conocen en el create, el calculo
// corre inline ahi mismo), convencion de retorno { data } | { error },
// guard de area (SOIL_MECHANICS), registerAudit() en cada escritura,
// assertReasonIfApproved / approvalResetIfNeeded en cada edicion.
//
// Sin qaStatus bloqueante: la norma no define un criterio de
// aceptacion/rechazo del valor de humedad -- el flujo de aprobacion
// estandar alcanza.
//
// Diseñado para ser referenciado por relacion desde otros ensayos
// futuros (ej. Cono de Arena, via moistureContentId opcional en ese
// modelo) -- ver CLAUDE.md.

import prisma from "../prismaClient";
import { calculateMoistureContentFromDb } from "../utils/moistureCalc";
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

async function runCalcAndSave(id: number) {
  const calc = await calculateMoistureContentFromDb(id);
  return prisma.moistureContent.update({
    where: { id },
    data: {
      wPercent: calc.wPercent,
      calcNote: calc.calcNote,
      status: calc.wPercent !== null ? "DONE" : "NEEDS_REVIEW",
    },
  });
}

// ---------------------------------------------------------------------
// POST /api/moisture-contents/sample/:sampleId
// ---------------------------------------------------------------------
export async function createMoistureContentService(params: {
  sampleIdRaw: unknown;
  body: {
    methodCode?: string | null;
    mrG: number;
    mhG: number;
    msG: number;
    dryingTempC: number;
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
      `Determinacion de Humedad es un ensayo de mecanica de suelos (SOIL_MECHANICS). La muestra ${sample.code} pertenece al area ${sample.area}.`
    );
  }

  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const { methodCode, mrG, mhG, msG, dryingTempC, notes } = params.body ?? ({} as any);

  if (!Number.isFinite(Number(mrG))) return err(400, "mrG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(mhG))) return err(400, "mhG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(msG))) return err(400, "msG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(dryingTempC))) {
    return err(400, "dryingTempC es obligatorio y debe ser numérico.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const mc = await tx.moistureContent.create({
      data: {
        sampleId,
        methodCode: methodCode ?? "MC Vol.8 §8.102.2",
        mrG: Number(mrG),
        mhG: Number(mhG),
        msG: Number(msG),
        dryingTempC: Number(dryingTempC),
        notes: notes ?? null,
        status: "DRAFT",
      },
    });
    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "MOISTURE_CONTENT",
          entityId: mc.id,
        })),
      });
    }
    return mc;
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "MoistureContent",
    entityId: created.id,
    previousValue: null,
    newValue: { ...created, equipmentIds },
  });

  const updated = await runCalcAndSave(created.id);

  return { data: updated };
}

// ---------------------------------------------------------------------
// GET /api/moisture-contents/:id
// ---------------------------------------------------------------------
export async function getMoistureContentByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const mc = await prisma.moistureContent.findUnique({ where: { id } });
  if (!mc) return err(404, "Determinación de Humedad no encontrada.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "MOISTURE_CONTENT", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...mc, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/moisture-contents/sample/:sampleId
// ---------------------------------------------------------------------
export async function listMoistureContentsBySampleService(
  sampleIdRaw: unknown
): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const list = await prisma.moistureContent.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });

  return { data: list };
}

// ---------------------------------------------------------------------
// PUT /api/moisture-contents/:id
// ---------------------------------------------------------------------
export async function updateMoistureContentService(params: {
  idRaw: unknown;
  body: {
    mrG?: number | null;
    mhG?: number | null;
    msG?: number | null;
    dryingTempC?: number | null;
    notes?: string | null;
    reason?: string;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const id = parseId(params.idRaw);
  if (!id) return err(400, "id inválido.");

  const current = await prisma.moistureContent.findUnique({ where: { id } });
  if (!current) return err(404, "Determinación de Humedad no encontrada.");

  const guardMsg = assertReasonIfApproved(current.isApproved, params.body.reason);
  if (guardMsg) return err(400, guardMsg);

  const data: any = {};
  if (params.body.mrG !== undefined) {
    if (!Number.isFinite(Number(params.body.mrG))) return err(400, "mrG debe ser numérico.");
    data.mrG = Number(params.body.mrG);
  }
  if (params.body.mhG !== undefined) {
    if (!Number.isFinite(Number(params.body.mhG))) return err(400, "mhG debe ser numérico.");
    data.mhG = Number(params.body.mhG);
  }
  if (params.body.msG !== undefined) {
    if (!Number.isFinite(Number(params.body.msG))) return err(400, "msG debe ser numérico.");
    data.msG = Number(params.body.msG);
  }
  if (params.body.dryingTempC !== undefined) {
    if (!Number.isFinite(Number(params.body.dryingTempC))) {
      return err(400, "dryingTempC debe ser numérico.");
    }
    data.dryingTempC = Number(params.body.dryingTempC);
  }
  if (params.body.notes !== undefined) data.notes = params.body.notes;

  Object.assign(data, approvalResetIfNeeded(current.isApproved));

  const savedRaw = await prisma.moistureContent.update({ where: { id }, data });

  await registerAudit({
    userId: params.userId,
    action: "UPDATE",
    entityType: "MoistureContent",
    entityId: savedRaw.id,
    previousValue: current,
    newValue: savedRaw,
    reason: params.body.reason,
  });

  const updated = await runCalcAndSave(id);

  return { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/moisture-contents/:id/recalculate
// ---------------------------------------------------------------------
export async function recalculateMoistureContentService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const existing = await prisma.moistureContent.findUnique({ where: { id } });
  if (!existing) return err(404, "Determinación de Humedad no encontrada.");

  const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
  if (guardMsg) return err(400, guardMsg);

  if (existing.isApproved) {
    await prisma.moistureContent.update({
      where: { id },
      data: approvalResetIfNeeded(existing.isApproved),
    });
  }

  const updated = await runCalcAndSave(id);

  await registerAudit({
    userId,
    action: "UPDATE",
    entityType: "MoistureContent",
    entityId: updated.id,
    previousValue: existing,
    newValue: updated,
    reason,
  });

  return { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/moisture-contents/:id/approve
// ---------------------------------------------------------------------
export async function approveMoistureContentService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const before = await prisma.moistureContent.findUnique({ where: { id } });
  if (!before) return err(404, "Determinación de Humedad no encontrada.");

  if (before.isApproved) return err(409, "Este registro ya estaba aprobado.");

  const updated = await prisma.moistureContent.update({
    where: { id },
    data: {
      isApproved: true,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });

  await registerAudit({
    userId,
    action: "APPROVE",
    entityType: "MoistureContent",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
