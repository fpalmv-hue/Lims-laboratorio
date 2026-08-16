// src/services/gravelDensity.service.ts
//
// Densidad Neta / Real de Gravas, NCh1117.Of2010. Convencion de retorno
// { data } | { error }, registerAudit() en cada escritura,
// assertReasonIfApproved / approvalResetIfNeeded en cada edicion.
//
// PRIMERA EXCEPCION a la regla de "un ensayo, una sola area": el guard
// acepta SOIL_MECHANICS o HORMIGON (confirmado con el usuario
// 12-ago-2026 -- ver nota en schema.prisma). LabArea.CONCRETE_AGGREGATES
// fue renombrado a HORMIGON el 15-ago-2026 (Fase 4).
//
// A diferencia de los demas ensayos, la tolerancia entre muestras
// gemelas (10.3.1 de la norma) es bloqueante en el propio create/update:
// si se excede, no se persiste nada (mismo criterio que las
// calibraciones de Cono de Arena) -- no hay un estado "NEEDS_REVIEW" con
// resultado parcial guardado, el registro solo existe si paso la
// tolerancia.

import prisma from "../prismaClient";
import { computeGravelDensityFromTwins } from "../utils/gravelDensityCalc";
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

const VALID_AREAS = ["SOIL_MECHANICS", "HORMIGON"];

type BuildCalcDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function buildCalcData(
  twins: { aG1: number; bG1: number; cG1: number; aG2: number; bG2: number; cG2: number }
): BuildCalcDataResult {
  const calc = computeGravelDensityFromTwins(twins);
  if (calc.error) return { ok: false, error: calc.error };

  return {
    ok: true,
    data: {
      realSssDensity1Kgm3: calc.det1!.realSssDensityKgm3,
      realDryDensity1Kgm3: calc.det1!.realDryDensityKgm3,
      netDensity1Kgm3: calc.det1!.netDensityKgm3,
      absorption1Percent: calc.det1!.absorptionPercent,
      realSssDensity2Kgm3: calc.det2!.realSssDensityKgm3,
      realDryDensity2Kgm3: calc.det2!.realDryDensityKgm3,
      netDensity2Kgm3: calc.det2!.netDensityKgm3,
      absorption2Percent: calc.det2!.absorptionPercent,
      realSssDensityDiffKgm3: calc.diffs.realSssDensityDiffKgm3,
      realDryDensityDiffKgm3: calc.diffs.realDryDensityDiffKgm3,
      netDensityDiffKgm3: calc.diffs.netDensityDiffKgm3,
      absorptionDiffPercent: calc.diffs.absorptionDiffPercent,
      realSssDensityKgm3: calc.final.realSssDensityKgm3,
      realDryDensityKgm3: calc.final.realDryDensityKgm3,
      netDensityKgm3: calc.final.netDensityKgm3,
      absorptionPercent: calc.final.absorptionPercent,
      calcNote: null as string | null,
      status: "DONE" as const,
    },
  };
}

// ---------------------------------------------------------------------
// POST /api/gravel-densities/sample/:sampleId
// ---------------------------------------------------------------------
export async function createGravelDensityService(params: {
  sampleIdRaw: unknown;
  body: {
    methodCode?: string | null;
    maxNominalSizeMm?: number | null;
    aG1: number;
    bG1: number;
    cG1: number;
    aG2: number;
    bG2: number;
    cG2: number;
    notes?: string | null;
    equipmentIds?: number[];
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw);
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  if (!VALID_AREAS.includes(sample.area)) {
    return err(
      400,
      `Densidad Neta/Real de Gravas (NCh1117.Of2010) es válido para muestras de SOIL_MECHANICS o HORMIGON. La muestra ${sample.code} pertenece al area ${sample.area}.`
    );
  }

  // Guard ISO 17025: todos los equipos declarados deben estar vigentes.
  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const { methodCode, maxNominalSizeMm, aG1, bG1, cG1, aG2, bG2, cG2, notes } = params.body ?? ({} as any);

  for (const [label, v] of Object.entries({ aG1, bG1, cG1, aG2, bG2, cG2 })) {
    if (!Number.isFinite(Number(v))) return err(400, `${label} es obligatorio y debe ser numérico.`);
  }

  const calc = buildCalcData({
    aG1: Number(aG1),
    bG1: Number(bG1),
    cG1: Number(cG1),
    aG2: Number(aG2),
    bG2: Number(bG2),
    cG2: Number(cG2),
  });
  if (!calc.ok) return err(400, calc.error);

  // Creación atómica: ensayo + EquipmentUsage en una transacción.
  const created = await prisma.$transaction(async (tx) => {
    const gd = await tx.gravelDensity.create({
      data: {
        sampleId,
        methodCode: methodCode ?? "NCh1117.Of2010",
        maxNominalSizeMm: maxNominalSizeMm ?? null,
        aG1: Number(aG1),
        bG1: Number(bG1),
        cG1: Number(cG1),
        aG2: Number(aG2),
        bG2: Number(bG2),
        cG2: Number(cG2),
        notes: notes ?? null,
        ...calc.data,
      },
    });
    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "GRAVEL_DENSITY",
          entityId: gd.id,
        })),
      });
    }
    return gd;
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "GravelDensity",
    entityId: created.id,
    previousValue: null,
    newValue: { ...created, equipmentIds },
  });

  return { data: created };
}

// ---------------------------------------------------------------------
// GET /api/gravel-densities/:id
// ---------------------------------------------------------------------
export async function getGravelDensityByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const gd = await prisma.gravelDensity.findUnique({ where: { id } });
  if (!gd) return err(404, "Densidad Neta/Real de Gravas no encontrada.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "GRAVEL_DENSITY", entityId: id },
    include: {
      equipment: {
        select: { id: true, code: true, type: true, category: true, status: true },
      },
    },
  });

  return { data: { ...gd, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/gravel-densities/sample/:sampleId
// ---------------------------------------------------------------------
export async function listGravelDensitiesBySampleService(sampleIdRaw: unknown): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const list = await prisma.gravelDensity.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });

  return { data: list };
}

// ---------------------------------------------------------------------
// PUT /api/gravel-densities/:id
// ---------------------------------------------------------------------
export async function updateGravelDensityService(params: {
  idRaw: unknown;
  body: {
    maxNominalSizeMm?: number | null;
    aG1?: number | null;
    bG1?: number | null;
    cG1?: number | null;
    aG2?: number | null;
    bG2?: number | null;
    cG2?: number | null;
    notes?: string | null;
    reason?: string;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const id = parseId(params.idRaw);
  if (!id) return err(400, "id inválido.");

  const current = await prisma.gravelDensity.findUnique({ where: { id } });
  if (!current) return err(404, "Densidad Neta/Real de Gravas no encontrada.");

  const guardMsg = assertReasonIfApproved(current.isApproved, params.body.reason);
  if (guardMsg) return err(400, guardMsg);

  const twins = {
    aG1: params.body.aG1 !== undefined ? Number(params.body.aG1) : current.aG1,
    bG1: params.body.bG1 !== undefined ? Number(params.body.bG1) : current.bG1,
    cG1: params.body.cG1 !== undefined ? Number(params.body.cG1) : current.cG1,
    aG2: params.body.aG2 !== undefined ? Number(params.body.aG2) : current.aG2,
    bG2: params.body.bG2 !== undefined ? Number(params.body.bG2) : current.bG2,
    cG2: params.body.cG2 !== undefined ? Number(params.body.cG2) : current.cG2,
  };
  for (const [label, v] of Object.entries(twins)) {
    if (!Number.isFinite(v)) return err(400, `${label} debe ser numérico.`);
  }

  const calc = buildCalcData(twins);
  if (!calc.ok) return err(400, calc.error);

  const data: any = { ...twins, ...calc.data };
  if (params.body.maxNominalSizeMm !== undefined) {
    data.maxNominalSizeMm = params.body.maxNominalSizeMm === null ? null : Number(params.body.maxNominalSizeMm);
  }
  if (params.body.notes !== undefined) data.notes = params.body.notes;

  Object.assign(data, approvalResetIfNeeded(current.isApproved));

  const updated = await prisma.gravelDensity.update({ where: { id }, data });

  await registerAudit({
    userId: params.userId,
    action: "UPDATE",
    entityType: "GravelDensity",
    entityId: updated.id,
    previousValue: current,
    newValue: updated,
    reason: params.body.reason,
  });

  return { data: updated };
}

// ---------------------------------------------------------------------
// POST /api/gravel-densities/:id/approve
// ---------------------------------------------------------------------
export async function approveGravelDensityService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const before = await prisma.gravelDensity.findUnique({ where: { id } });
  if (!before) return err(404, "Densidad Neta/Real de Gravas no encontrada.");

  if (before.isApproved) return err(409, "Este registro ya estaba aprobado.");

  const updated = await prisma.gravelDensity.update({
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
    entityType: "GravelDensity",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
