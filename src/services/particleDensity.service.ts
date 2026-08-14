// src/services/particleDensity.service.ts
//
// Densidad de Particulas Solidas, NCh1532.Of80 (metodo picnometro,
// particulas < 5mm). Mismo patron que cbr.service.ts: convencion de
// retorno { data } | { error }, guard de area (SOIL_MECHANICS),
// registerAudit() en cada escritura, assertReasonIfApproved /
// approvalResetIfNeeded en cada edicion.
//
// A diferencia de Proctor/Cbr (que acumulan puntos), este es un registro
// "plano": todos los inputs (ms, Mm, tx, pycnometerId) se conocen en el
// create, asi que el calculo corre inline ahi mismo (mismo espiritu que
// atterbergController.ts). recalculateParticleDensityService queda
// disponible para el caso de que el picnometro se re-calibre despues.
//
// Sin qaStatus bloqueante: la norma no define un umbral numerico de
// aceptacion/rechazo (solo recomienda repetir el ensayo como
// verificacion cruzada) -- el flujo de aprobacion estandar alcanza.

import prisma from "../prismaClient";
import { calculateParticleDensityFromDb } from "../utils/particleDensityCalc";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";
import { assertEquipmentUsable } from "../utils/equipmentGuard";

type ServiceError = { error: { status: number; message: string } };
type ServiceOk<T> = { data: T; warning?: string };
type ServiceResult<T> = ServiceOk<T> | ServiceError;

function err(status: number, message: string): ServiceError {
  return { error: { status, message } };
}

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// Precision de balanza esperada segun el tipo de contenedor (informativo,
// sin bloqueo -- confirmado con el usuario 12-ago-2026).
const EXPECTED_BALANCE_PRECISION_G: Record<string, number> = {
  FLASK: 0.01,
  BOTTLE: 0.001,
};

function balancePrecisionWarning(
  containerType: string | null | undefined,
  balancePrecisionG: number | null | undefined
): string | undefined {
  if (!containerType || balancePrecisionG === null || balancePrecisionG === undefined) return undefined;
  const expected = EXPECTED_BALANCE_PRECISION_G[containerType];
  if (expected === undefined) return undefined;
  if (Number(balancePrecisionG) !== expected) {
    return `La norma recomienda balanza de ${expected} g de precision para contenedor tipo ${containerType}; se declaro ${balancePrecisionG} g.`;
  }
  return undefined;
}

async function runCalcAndSave(id: number) {
  const calc = await calculateParticleDensityFromDb(id);
  return prisma.particleDensity.update({
    where: { id },
    data: {
      maAtTestTempG: calc.maAtTestTempG,
      waterDensityAtTestG: calc.waterDensityAtTestG,
      particleDensityGcm3: calc.particleDensityGcm3,
      calcNote: calc.calcNote,
      status: calc.particleDensityGcm3 !== null ? "DONE" : "NEEDS_REVIEW",
    },
  });
}

// ---------------------------------------------------------------------
// POST /api/particle-densities/sample/:sampleId
// ---------------------------------------------------------------------
export async function createParticleDensityService(params: {
  sampleIdRaw: unknown;
  body: {
    pycnometerId?: number | string;
    methodCode?: string | null;
    containerType?: string | null;
    balancePrecisionG?: number | null;
    msG: number;
    mmG: number;
    testTempC: number;
    notes?: string | null;
    equipmentIds?: number[];
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw);
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  // CRITICO: Densidad de Particulas Solidas es un ensayo de mecanica de
  // suelos. No debe crearse sobre una muestra de otra area del laboratorio.
  if (sample.area !== "SOIL_MECHANICS") {
    return err(
      400,
      `Densidad de Particulas Solidas es un ensayo de mecanica de suelos (SOIL_MECHANICS). La muestra ${sample.code} pertenece al area ${sample.area}.`
    );
  }

  const pycnometerId = parseId(params.body?.pycnometerId);
  if (!pycnometerId) return err(400, "pycnometerId es obligatorio y debe ser numérico.");

  const pycnometer = await prisma.pycnometer.findUnique({ where: { id: pycnometerId } });
  if (!pycnometer) return err(404, "Picnometro no encontrado.");

  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const { methodCode, containerType, balancePrecisionG, msG, mmG, testTempC, notes } = params.body ?? ({} as any);

  if (!Number.isFinite(Number(msG))) return err(400, "msG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(mmG))) return err(400, "mmG es obligatorio y debe ser numérico.");
  if (!Number.isFinite(Number(testTempC))) return err(400, "testTempC es obligatorio y debe ser numérico.");

  const created = await prisma.$transaction(async (tx) => {
    const pd = await tx.particleDensity.create({
      data: {
        sampleId,
        pycnometerId,
        methodCode: methodCode ?? "NCh1532.Of80",
        containerType: (containerType ?? null) as any,
        balancePrecisionG: balancePrecisionG ?? null,
        msG: Number(msG),
        mmG: Number(mmG),
        testTempC: Number(testTempC),
        notes: notes ?? null,
        status: "DRAFT",
      },
    });
    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "PARTICLE_DENSITY",
          entityId: pd.id,
        })),
      });
    }
    return pd;
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "ParticleDensity",
    entityId: created.id,
    previousValue: null,
    newValue: { ...created, equipmentIds },
  });

  const updated = await runCalcAndSave(created.id);
  const warning = balancePrecisionWarning(containerType ?? null, balancePrecisionG ?? null);

  return warning ? { data: updated, warning } : { data: updated };
}

// ---------------------------------------------------------------------
// GET /api/particle-densities/:id
// ---------------------------------------------------------------------
export async function getParticleDensityByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const pd = await prisma.particleDensity.findUnique({
    where: { id },
    include: { pycnometer: { include: { equipment: true } } },
  });

  if (!pd) return err(404, "Densidad de Particulas Solidas no encontrada.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "PARTICLE_DENSITY", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...pd, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/particle-densities/sample/:sampleId
// ---------------------------------------------------------------------
export async function listParticleDensitiesBySampleService(
  sampleIdRaw: unknown
): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const list = await prisma.particleDensity.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });

  return { data: list };
}

// ---------------------------------------------------------------------
// PUT /api/particle-densities/:id
// ---------------------------------------------------------------------
export async function updateParticleDensityService(params: {
  idRaw: unknown;
  body: {
    pycnometerId?: number | string | null;
    containerType?: string | null;
    balancePrecisionG?: number | null;
    msG?: number | null;
    mmG?: number | null;
    testTempC?: number | null;
    notes?: string | null;
    reason?: string;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const id = parseId(params.idRaw);
  if (!id) return err(400, "id inválido.");

  const current = await prisma.particleDensity.findUnique({ where: { id } });
  if (!current) return err(404, "Densidad de Particulas Solidas no encontrada.");

  const guardMsg = assertReasonIfApproved(current.isApproved, params.body.reason);
  if (guardMsg) return err(400, guardMsg);

  const data: any = {};

  if (params.body.pycnometerId !== undefined) {
    const pycnometerId = parseId(params.body.pycnometerId);
    if (!pycnometerId) return err(400, "pycnometerId inválido.");
    const pycnometer = await prisma.pycnometer.findUnique({ where: { id: pycnometerId } });
    if (!pycnometer) return err(404, "Picnometro no encontrado.");
    data.pycnometerId = pycnometerId;
  }
  if (params.body.containerType !== undefined) data.containerType = params.body.containerType;
  if (params.body.balancePrecisionG !== undefined) {
    data.balancePrecisionG =
      params.body.balancePrecisionG === null ? null : Number(params.body.balancePrecisionG);
  }
  if (params.body.msG !== undefined) {
    if (!Number.isFinite(Number(params.body.msG))) return err(400, "msG debe ser numérico.");
    data.msG = Number(params.body.msG);
  }
  if (params.body.mmG !== undefined) {
    if (!Number.isFinite(Number(params.body.mmG))) return err(400, "mmG debe ser numérico.");
    data.mmG = Number(params.body.mmG);
  }
  if (params.body.testTempC !== undefined) {
    if (!Number.isFinite(Number(params.body.testTempC))) return err(400, "testTempC debe ser numérico.");
    data.testTempC = Number(params.body.testTempC);
  }
  if (params.body.notes !== undefined) data.notes = params.body.notes;

  Object.assign(data, approvalResetIfNeeded(current.isApproved));

  const savedRaw = await prisma.particleDensity.update({ where: { id }, data });

  await registerAudit({
    userId: params.userId,
    action: "UPDATE",
    entityType: "ParticleDensity",
    entityId: savedRaw.id,
    previousValue: current,
    newValue: savedRaw,
    reason: params.body.reason,
  });

  const updated = await runCalcAndSave(id);

  const warning = balancePrecisionWarning(
    updated.containerType ?? undefined,
    updated.balancePrecisionG ?? undefined
  );

  return warning ? { data: updated, warning } : { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/particle-densities/:id/recalculate
// (util cuando el picnometro se re-calibra despues de creado el registro)
// ---------------------------------------------------------------------
export async function recalculateParticleDensityService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const existing = await prisma.particleDensity.findUnique({ where: { id } });
  if (!existing) return err(404, "Densidad de Particulas Solidas no encontrada.");

  const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
  if (guardMsg) return err(400, guardMsg);

  if (existing.isApproved) {
    await prisma.particleDensity.update({
      where: { id },
      data: approvalResetIfNeeded(existing.isApproved),
    });
  }

  const updated = await runCalcAndSave(id);

  await registerAudit({
    userId,
    action: "UPDATE",
    entityType: "ParticleDensity",
    entityId: updated.id,
    previousValue: existing,
    newValue: updated,
    reason,
  });

  return { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/particle-densities/:id/approve
// ---------------------------------------------------------------------
export async function approveParticleDensityService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const before = await prisma.particleDensity.findUnique({ where: { id } });
  if (!before) return err(404, "Densidad de Particulas Solidas no encontrada.");

  if (before.isApproved) return err(409, "Este registro ya estaba aprobado.");

  const updated = await prisma.particleDensity.update({
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
    entityType: "ParticleDensity",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
