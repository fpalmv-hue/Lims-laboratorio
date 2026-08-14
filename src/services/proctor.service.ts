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
//
// Trazabilidad ISO 17025: las funciones que escriben en la base (create,
// addPoint, recalculate) reciben userId y llaman a registerAudit() luego
// de la escritura.

import prisma from "../prismaClient";
import { calculateProctorFromDb } from "../utils/proctorCalc";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";
import { assertEquipmentUsable } from "../utils/equipmentGuard";

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
    equipmentIds?: number[];
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw, "sampleId");
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  if (sample.area !== "SOIL_MECHANICS") {
    return err(400, `Proctor es un ensayo de mecanica de suelos (SOIL_MECHANICS). La muestra ${sample.code} pertenece al area ${sample.area}.`);
  }

  // Guard ISO 17025: moldes declarados deben estar vigentes.
  // ATENCION: en produccion (14-ago-2026) los moldes reales PROCTOR-STD-01
  // y PROCTOR-STD-02 tienen verificationDueAt=null (sin verificacion
  // registrada) y seran bloqueados por este guard hasta que el tecnico
  // registre una verificacion real via POST /api/molds/:id/verify.
  // Esto es el comportamiento correcto, no un bug.
  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const { methodCode, methodName, layers, blowsPerLayer, notes } = params.body ?? {};

  const proctor = await prisma.$transaction(async (tx) => {
    const p = await tx.proctor.create({
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
    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "PROCTOR",
          entityId: p.id,
        })),
      });
    }
    return p;
  });

  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "Proctor",
    entityId: proctor.id,
    previousValue: null,
    newValue: { ...proctor, equipmentIds },
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
      points: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { mold: { include: { equipment: true } } } },
    },
  });

  if (!proctor) return err(404, "Proctor no encontrado.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "PROCTOR", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...proctor, equiposUsados } };
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
    reason?: string;
  };
  userId: number;
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

  // Regla ISO 17025: agregar un punto a un Proctor ya aprobado invalida
  // esa aprobación (cambia el dataset base de OMC/MDD) -- reason es
  // obligatorio, y el Proctor padre revierte isApproved a false más abajo.
  const guardMsg = assertReasonIfApproved(proctor.isApproved, params.body.reason);
  if (guardMsg) return err(400, guardMsg);

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

  // Trazabilidad ISO 17025: registrar la creación del punto Proctor.
  await registerAudit({
    userId: params.userId,
    action: "CREATE",
    entityType: "ProctorPoint",
    entityId: point.id,
    previousValue: null,
    newValue: point,
    reason: params.body.reason,
  });

  // Si el Proctor padre ya estaba aprobado, agregar un punto nuevo
  // invalida esa aprobación -- vuelve a quedar pendiente de visado.
  if (proctor.isApproved) {
    const revertedProctor = await prisma.proctor.update({
      where: { id: proctorId },
      data: approvalResetIfNeeded(proctor.isApproved),
    });

    await registerAudit({
      userId: params.userId,
      action: "UPDATE",
      entityType: "Proctor",
      entityId: proctorId,
      previousValue: proctor,
      newValue: revertedProctor,
      reason: params.body.reason,
    });
  }

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
  proctorIdRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const proctorId = parseId(proctorIdRaw, "id");
  if (!proctorId) return err(400, "id de proctor inválido.");

  const existing = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!existing) return err(404, "Proctor no encontrado.");

  // Regla ISO 17025: si ya estaba aprobado, reason es obligatorio, y el
  // recálculo revierte automáticamente isApproved a false.
  const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
  if (guardMsg) return err(400, guardMsg);

  const calc = await calculateProctorFromDb(proctorId);

  const updated = await prisma.proctor.update({
    where: { id: proctorId },
    data: {
      omcPercent: calc.omcPercent,
      mddDryDensity: calc.mddDryDensity,
      chartJson: calc.chartJson as any,
      ...approvalResetIfNeeded(existing.isApproved),
    },
  });

  // Trazabilidad ISO 17025: registrar el recálculo (OMC/MDD nuevos vs.
  // los que tenía antes el registro, incluye el revert de isApproved si aplicó).
  await registerAudit({
    userId,
    action: "UPDATE",
    entityType: "Proctor",
    entityId: updated.id,
    previousValue: existing,
    newValue: updated,
    reason,
  });

  return { data: { proctor: updated, calc } };
}

// ---------------------------------------------------------------------
// POST /api/proctors/:id/approve
// ---------------------------------------------------------------------
export async function approveProctorService(
  proctorIdRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const proctorId = parseId(proctorIdRaw, "id");
  if (!proctorId) return err(400, "id de proctor inválido.");

  const before = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!before) return err(404, "Proctor no encontrado.");

  if (before.isApproved) return err(409, "Este Proctor ya estaba aprobado.");

  const updated = await prisma.proctor.update({
    where: { id: proctorId },
    data: {
      isApproved: true,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });

  // Trazabilidad ISO 17025: registrar la aprobación como evento propio.
  await registerAudit({
    userId,
    action: "APPROVE",
    entityType: "Proctor",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
