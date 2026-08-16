// src/services/aggregateGranulometry.service.ts
//
// Granulometria de Aridos, NCh165.Of2009 / MOP 8.202.3. Primer ensayo de
// Hormigon y Aridos, equipment-aware desde el dia uno (no retrofiteado).
// Area FIJA HORMIGON -- a diferencia de GravelDensity, no acepta
// SOIL_MECHANICS (series de tamices y normas distintas).
//
// Dos reglas bloqueantes (rechazan con 400, no persisten nada, mismo
// patron que la tolerancia de muestras gemelas de GravelDensity/NCh1117
// 10.3.1 -- NO el qaStatus persistido-aunque-falle de Granulometry de
// Suelos, que es una regla normativa distinta):
//   1. Balance de masa cl. 10.1/10.2 (tolerancia 1% fino / 0.5% grueso).
//   2. Fraccion mixta >15% inconsistente con tipoArido declarado
//      (cl. 8.1.2/8.2.2) -- separacion real NO implementada en esta fase.
//
// QA de tamaño de muestra (Tablas 3-4) es NO bloqueante, persistido en
// qaStatus, mismo patron que evaluateFractionMassBalance de Granulometry
// de Suelos.
import prisma from "../prismaClient";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";
import { assertEquipmentUsable } from "../utils/equipmentGuard";
import {
  AggregateSieveInput,
  AggregateTypeLabel,
  normalizeAggregateSieves,
  computeMassBalance,
  computeSievePercentages,
  checkMixedFractionConsistency,
  computeFinenessModulus,
  evaluateSampleSizeQa,
  TABLE_5_GAP_NOTE,
} from "../utils/aggregateGranulometryCalc";

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

const VALID_TIPO_ARIDO = ["FINO", "GRUESO", "MEZCLADO"];

// ---------------------------------------------------------------------
// POST /api/aggregate-granulometries/sample/:sampleId
// ---------------------------------------------------------------------
export async function createAggregateGranulometryService(params: {
  sampleIdRaw: unknown;
  body: {
    tipoArido?: string;
    masaInicialSeca?: number;
    tamañoMaximoNominalMm?: number | null;
    masaDeposito?: number;
    sieves?: Array<{ openingMm: number; retainedMass: number; nominalLabel?: string | null }>;
    equipmentIds?: number[];
    methodCode?: string | null;
    notes?: string | null;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw);
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  // CRITICO: Granulometria de Aridos implementa NCh165.Of2009 (MOP
  // 8.202.3), exclusiva de HORMIGON -- existe una norma paralela para
  // Suelos (MOP 8.102.1, serie de tamices distinta), no deben mezclarse.
  // A diferencia de GravelDensity, no hay excepcion de doble area aqui.
  if (sample.area !== "HORMIGON") {
    return err(
      400,
      `Granulometría de Áridos (NCh165.Of2009) es un ensayo de Hormigón y Áridos (HORMIGON). La muestra ${sample.code} pertenece al área ${sample.area}.`
    );
  }

  // Guard ISO 17025: equipos declarados deben estar vigentes.
  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  const tipoArido = params.body.tipoArido;
  if (!tipoArido || !VALID_TIPO_ARIDO.includes(tipoArido)) {
    return err(400, `tipoArido es obligatorio y debe ser uno de: ${VALID_TIPO_ARIDO.join(", ")}.`);
  }

  const masaInicialSeca = Number(params.body.masaInicialSeca);
  if (!Number.isFinite(masaInicialSeca) || masaInicialSeca <= 0) {
    return err(400, "masaInicialSeca es obligatoria y debe ser numérica > 0.");
  }

  const masaDeposito = Number(params.body.masaDeposito);
  if (!Number.isFinite(masaDeposito) || masaDeposito < 0) {
    return err(400, "masaDeposito es obligatoria y debe ser numérica >= 0.");
  }

  const tamañoMaximoNominalMm =
    params.body.tamañoMaximoNominalMm === undefined || params.body.tamañoMaximoNominalMm === null
      ? null
      : Number(params.body.tamañoMaximoNominalMm);
  if (tamañoMaximoNominalMm !== null && !Number.isFinite(tamañoMaximoNominalMm)) {
    return err(400, "tamañoMaximoNominalMm debe ser numérico o null.");
  }

  const rawSieves = params.body.sieves;
  if (!Array.isArray(rawSieves)) {
    return err(400, "sieves es obligatorio (arreglo con los 10 tamices de la serie preferida).");
  }
  const { sieves, error: sieveError } = normalizeAggregateSieves(rawSieves as AggregateSieveInput[]);
  if (sieveError) return err(400, sieveError);

  // --- Balance de masa, cl. 10.1/10.2 -- BLOQUEANTE ---
  const balance = computeMassBalance({
    sieves,
    masaDeposito,
    masaInicialSeca,
    tipoArido: tipoArido as AggregateTypeLabel,
  });
  if (!balance.ok) {
    return err(
      400,
      `Balance de masa fuera de tolerancia NCh165.Of2009 (cl. 10.1/10.2): diferencia ${balance.diferenciaPercent}% (tolerancia ${balance.toleranciaPercent}% para ${tipoArido}). Debe ensayarse una muestra gemela nueva.`
    );
  }

  const sieveResults = computeSievePercentages(sieves, balance.sumaFracciones);

  // --- Fraccion mixta inconsistente, cl. 8.1.2/8.2.2 -- BLOQUEANTE ---
  const mixedCheck = checkMixedFractionConsistency(sieveResults, tipoArido as AggregateTypeLabel);
  if (!mixedCheck.ok) {
    return err(400, mixedCheck.error as string);
  }

  const mf = computeFinenessModulus(sieveResults, tipoArido as AggregateTypeLabel);

  // --- QA tamaño de muestra, Tablas 3-4 -- NO bloqueante ---
  const qa = evaluateSampleSizeQa({
    tipoArido: tipoArido as AggregateTypeLabel,
    masaInicialSeca,
    tamañoMaximoNominalMm,
    results: sieveResults,
  });
  const calcNotes = [...qa.messages, TABLE_5_GAP_NOTE].join(" | ");

  const created = await prisma.$transaction(async (tx) => {
    const ag = await tx.aggregateGranulometry.create({
      data: {
        sampleId,
        methodCode: params.body.methodCode ?? "NCh165.Of2009",
        status: "DONE",
        tipoArido: tipoArido as AggregateTypeLabel,
        masaInicialSeca,
        tamañoMaximoNominalMm,
        masaDeposito,
        sumaFracciones: balance.sumaFracciones,
        diferenciaPercent: balance.diferenciaPercent,
        moduloFinura: mf.moduloFinura,
        moduloFinuraCase: mf.moduloFinuraCase,
        qaStatus: qa.qaStatus,
        calcNotes,
        notes: params.body.notes ?? null,
      },
    });

    await tx.aggregateGranulometrySieve.createMany({
      data: sieveResults.map((s) => ({
        aggregateGranulometryId: ag.id,
        order: s.order,
        openingMm: s.openingMm,
        nominalLabel: s.nominalLabel,
        retainedMass: s.retainedMass,
        percentRetained: s.percentRetained,
        percentAccumRetained: s.percentAccumRetained,
        percentPassing: s.percentPassing,
      })),
    });

    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "AGGREGATE_GRANULOMETRY",
          entityId: ag.id,
        })),
      });
    }

    return tx.aggregateGranulometry.findUnique({
      where: { id: ag.id },
      include: { sieves: { orderBy: { order: "asc" } } },
    });
  });

  if (created) {
    await registerAudit({
      userId: params.userId,
      action: "CREATE",
      entityType: "AggregateGranulometry",
      entityId: created.id,
      previousValue: null,
      newValue: { ...created, equipmentIds },
    });
  }

  return { data: { ...created, qa } };
}

// ---------------------------------------------------------------------
// GET /api/aggregate-granulometries/:id
// ---------------------------------------------------------------------
export async function getAggregateGranulometryByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const ag = await prisma.aggregateGranulometry.findUnique({
    where: { id },
    include: { sieves: { orderBy: { order: "asc" } } },
  });
  if (!ag) return err(404, "Granulometría de Áridos no encontrada.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "AGGREGATE_GRANULOMETRY", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...ag, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/aggregate-granulometries/sample/:sampleId
// ---------------------------------------------------------------------
export async function listAggregateGranulometriesBySampleService(
  sampleIdRaw: unknown
): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const list = await prisma.aggregateGranulometry.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
    include: { sieves: { orderBy: { order: "asc" } } },
  });

  return { data: list };
}

// ---------------------------------------------------------------------
// POST /api/aggregate-granulometries/:id/approve
// ---------------------------------------------------------------------
export async function approveAggregateGranulometryService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const before = await prisma.aggregateGranulometry.findUnique({ where: { id } });
  if (!before) return err(404, "Granulometría de Áridos no encontrada.");

  if (before.isApproved) return err(409, "Este registro ya estaba aprobado.");

  const updated = await prisma.aggregateGranulometry.update({
    where: { id },
    data: { isApproved: true, approvedById: userId, approvedAt: new Date() },
  });

  await registerAudit({
    userId,
    action: "APPROVE",
    entityType: "AggregateGranulometry",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
