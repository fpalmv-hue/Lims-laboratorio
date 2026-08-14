// src/services/sandConeTest.service.ts
//
// Densidad en el Terreno -- Metodo del Cono de Arena, MC Vol.8 §8.102.9.
// Ensayo de campo (registro plano por punto/perforacion), mismo patron
// que particleDensity.service.ts: convencion de retorno { data } |
// { error }, guard de area (SOIL_MECHANICS), registerAudit() en cada
// escritura, assertReasonIfApproved / approvalResetIfNeeded en cada
// edicion, sin qaStatus bloqueante en el resultado (las tolerancias
// explicitas de la norma aplican a la calibracion de arena/embudo, no
// aca -- ver sandCone.controller.ts).
//
// Particularidad: depende de un MoistureContent (humedad) y un SandCone
// (calibracion) ya existentes. La humedad NO se recibe como campo suelto
// -- se lee del MoistureContent referenciado, que debe pertenecer a la
// misma muestra.

import prisma from "../prismaClient";
import { calculateSandConeTestFromDb } from "../utils/sandConeCalc";
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
  const calc = await calculateSandConeTestFromDb(id);
  return prisma.sandConeTest.update({
    where: { id },
    data: {
      mpG: calc.mpG,
      msG: calc.msG,
      volumeCm3: calc.volumeCm3,
      dryDensityGcm3: calc.dryDensityGcm3,
      wetDensityGcm3: calc.wetDensityGcm3,
      calcNote: calc.calcNote,
      status: calc.dryDensityGcm3 !== null ? "DONE" : "NEEDS_REVIEW",
    },
  });
}

// ---------------------------------------------------------------------
// POST /api/sand-cone-tests/sample/:sampleId
// ---------------------------------------------------------------------
export async function createSandConeTestService(params: {
  sampleIdRaw: unknown;
  body: {
    sandConeId?: number | string;
    moistureContentId?: number | string;
    methodCode?: string | null;
    minExcavationVolumeCm3?: number | null;
    mtiG: number;
    mtfG: number;
    mhG: number;
    notes?: string | null;
    equipmentIds?: number[];
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw);
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  // CRITICO: Cono de Arena es un ensayo de mecanica de suelos. No debe
  // crearse sobre una muestra de otra area del laboratorio.
  if (sample.area !== "SOIL_MECHANICS") {
    return err(
      400,
      `Cono de Arena es un ensayo de mecanica de suelos (SOIL_MECHANICS). La muestra ${sample.code} pertenece al area ${sample.area}.`
    );
  }

  const sandConeId = parseId(params.body?.sandConeId);
  if (!sandConeId) return err(400, "sandConeId es obligatorio y debe ser numérico.");

  const sandCone = await prisma.sandCone.findUnique({ where: { id: sandConeId } });
  if (!sandCone) return err(404, "Cono de arena no encontrado.");

  const moistureContentId = parseId(params.body?.moistureContentId);
  if (!moistureContentId) return err(400, "moistureContentId es obligatorio y debe ser numérico.");

  const moistureContent = await prisma.moistureContent.findUnique({ where: { id: moistureContentId } });
  if (!moistureContent) return err(404, "MoistureContent (humedad) no encontrado.");
  if (moistureContent.sampleId !== sampleId) {
    return err(400, "El MoistureContent indicado no pertenece a esta muestra.");
  }

  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const { methodCode, minExcavationVolumeCm3, mtiG, mtfG, mhG, notes } = params.body ?? ({} as any);

  if (!Number.isFinite(Number(mtiG))) return err(400, "mtiG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(mtfG))) return err(400, "mtfG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(mhG))) return err(400, "mhG es obligatorio y debe ser numérico.");

  const created = await prisma.$transaction(async (tx) => {
    const sct = await tx.sandConeTest.create({
      data: {
        sampleId,
        sandConeId,
        moistureContentId,
        methodCode: methodCode ?? "MC Vol.8 §8.102.9",
        minExcavationVolumeCm3: minExcavationVolumeCm3 ?? null,
        mtiG: Number(mtiG),
        mtfG: Number(mtfG),
        mhG: Number(mhG),
        notes: notes ?? null,
        status: "DRAFT",
      },
    });
    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "SAND_CONE_TEST",
          entityId: sct.id,
        })),
      });
    }
    return sct;
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "SandConeTest",
    entityId: created.id,
    previousValue: null,
    newValue: { ...created, equipmentIds },
  });

  const updated = await runCalcAndSave(created.id);

  return { data: updated };
}

// ---------------------------------------------------------------------
// GET /api/sand-cone-tests/:id
// ---------------------------------------------------------------------
export async function getSandConeTestByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const test = await prisma.sandConeTest.findUnique({
    where: { id },
    include: {
      sandCone: { include: { equipment: true } },
      moistureContent: true,
    },
  });

  if (!test) return err(404, "Cono de Arena (ensayo) no encontrado.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "SAND_CONE_TEST", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...test, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/sand-cone-tests/sample/:sampleId
// ---------------------------------------------------------------------
export async function listSandConeTestsBySampleService(
  sampleIdRaw: unknown
): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const list = await prisma.sandConeTest.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });

  return { data: list };
}

// ---------------------------------------------------------------------
// PUT /api/sand-cone-tests/:id
// ---------------------------------------------------------------------
export async function updateSandConeTestService(params: {
  idRaw: unknown;
  body: {
    sandConeId?: number | string | null;
    moistureContentId?: number | string | null;
    minExcavationVolumeCm3?: number | null;
    mtiG?: number | null;
    mtfG?: number | null;
    mhG?: number | null;
    notes?: string | null;
    reason?: string;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const id = parseId(params.idRaw);
  if (!id) return err(400, "id inválido.");

  const current = await prisma.sandConeTest.findUnique({ where: { id } });
  if (!current) return err(404, "Cono de Arena (ensayo) no encontrado.");

  const guardMsg = assertReasonIfApproved(current.isApproved, params.body.reason);
  if (guardMsg) return err(400, guardMsg);

  const data: any = {};

  if (params.body.sandConeId !== undefined) {
    const sandConeId = parseId(params.body.sandConeId);
    if (!sandConeId) return err(400, "sandConeId inválido.");
    const sandCone = await prisma.sandCone.findUnique({ where: { id: sandConeId } });
    if (!sandCone) return err(404, "Cono de arena no encontrado.");
    data.sandConeId = sandConeId;
  }

  if (params.body.moistureContentId !== undefined) {
    const moistureContentId = parseId(params.body.moistureContentId);
    if (!moistureContentId) return err(400, "moistureContentId inválido.");
    const moistureContent = await prisma.moistureContent.findUnique({ where: { id: moistureContentId } });
    if (!moistureContent) return err(404, "MoistureContent (humedad) no encontrado.");
    if (moistureContent.sampleId !== current.sampleId) {
      return err(400, "El MoistureContent indicado no pertenece a esta muestra.");
    }
    data.moistureContentId = moistureContentId;
  }

  if (params.body.minExcavationVolumeCm3 !== undefined) {
    data.minExcavationVolumeCm3 =
      params.body.minExcavationVolumeCm3 === null ? null : Number(params.body.minExcavationVolumeCm3);
  }
  if (params.body.mtiG !== undefined) {
    if (!Number.isFinite(Number(params.body.mtiG))) return err(400, "mtiG debe ser numérico.");
    data.mtiG = Number(params.body.mtiG);
  }
  if (params.body.mtfG !== undefined) {
    if (!Number.isFinite(Number(params.body.mtfG))) return err(400, "mtfG debe ser numérico.");
    data.mtfG = Number(params.body.mtfG);
  }
  if (params.body.mhG !== undefined) {
    if (!Number.isFinite(Number(params.body.mhG))) return err(400, "mhG debe ser numérico.");
    data.mhG = Number(params.body.mhG);
  }
  if (params.body.notes !== undefined) data.notes = params.body.notes;

  Object.assign(data, approvalResetIfNeeded(current.isApproved));

  const savedRaw = await prisma.sandConeTest.update({ where: { id }, data });

  await registerAudit({
    userId: params.userId,
    action: "UPDATE",
    entityType: "SandConeTest",
    entityId: savedRaw.id,
    previousValue: current,
    newValue: savedRaw,
    reason: params.body.reason,
  });

  const updated = await runCalcAndSave(id);

  return { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/sand-cone-tests/:id/recalculate
// ---------------------------------------------------------------------
export async function recalculateSandConeTestService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const existing = await prisma.sandConeTest.findUnique({ where: { id } });
  if (!existing) return err(404, "Cono de Arena (ensayo) no encontrado.");

  const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
  if (guardMsg) return err(400, guardMsg);

  if (existing.isApproved) {
    await prisma.sandConeTest.update({
      where: { id },
      data: approvalResetIfNeeded(existing.isApproved),
    });
  }

  const updated = await runCalcAndSave(id);

  await registerAudit({
    userId,
    action: "UPDATE",
    entityType: "SandConeTest",
    entityId: updated.id,
    previousValue: existing,
    newValue: updated,
    reason,
  });

  return { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/sand-cone-tests/:id/approve
// ---------------------------------------------------------------------
export async function approveSandConeTestService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const before = await prisma.sandConeTest.findUnique({ where: { id } });
  if (!before) return err(404, "Cono de Arena (ensayo) no encontrado.");

  if (before.isApproved) return err(409, "Este registro ya estaba aprobado.");

  const updated = await prisma.sandConeTest.update({
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
    entityType: "SandConeTest",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
