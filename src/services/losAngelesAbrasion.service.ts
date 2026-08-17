// src/services/losAngelesAbrasion.service.ts
//
// Desgaste Los Angeles de Aridos, NCh1369:2010. Exclusivo de area
// HORMIGON. Convencion de retorno { data } | { error }, registerAudit()
// en cada escritura -- ver aggregateGranulometryCalc.ts / cabecera de
// losAngelesAbrasionCalc.ts para el detalle de los dos datasets
// separados (granulometria de origen vs. carga de ensayo) y por que NO
// son el mismo dato.
//
// Dos reglas bloqueantes (rechazan con 400, no persisten nada, mismo
// patron que AggregateGranulometry/GravelDensity):
//   1. sourceSieves debe tener exactamente los 11 tamices de cl. 7.2.
//   2. fractions debe coincidir exacto (cantidad y masas dentro de
//      tolerancia) con Tabla 1 para el grado ya determinado.
import prisma from "../prismaClient";
import { registerAudit } from "../utils/auditLog";
import { assertEquipmentUsable } from "../utils/equipmentGuard";
import {
  SourceSieveInput,
  FractionInput,
  normalizeSourceSieves,
  computeSourcePercentages,
  determineGrade,
  getGradeGroup,
  getMachineConditions,
  validateFractions,
  computeAbrasionPercent,
} from "../utils/losAngelesAbrasionCalc";

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
// POST /api/los-angeles-abrasions/sample/:sampleId
// ---------------------------------------------------------------------
export async function createLosAngelesAbrasionService(params: {
  sampleIdRaw: unknown;
  body: {
    methodCode?: string | null;
    sourceSieves?: SourceSieveInput[];
    fractions?: FractionInput[];
    masaInicial?: number;
    masaFinal?: number;
    equipmentIds?: number[];
    notes?: string | null;
  };
  userId: number;
}): Promise<ServiceResult<any>> {
  const sampleId = parseId(params.sampleIdRaw);
  if (!sampleId) return err(400, "sampleId es obligatorio y debe ser numérico.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  // Exclusivo de HORMIGON (a diferencia de GravelDensity, sin excepcion
  // de doble area -- misma norma paralela que AggregateGranulometry).
  if (sample.area !== "HORMIGON") {
    return err(
      400,
      `Desgaste Los Ángeles (NCh1369.Of2010) es un ensayo de Hormigón y Áridos (HORMIGON). La muestra ${sample.code} pertenece al área ${sample.area}.`
    );
  }

  // Guard ISO 17025: equipos declarados deben estar vigentes.
  const equipmentIds: number[] = Array.isArray(params.body?.equipmentIds)
    ? params.body.equipmentIds.map(Number)
    : [];
  const guardMsg = await assertEquipmentUsable(equipmentIds);
  if (guardMsg) return err(400, guardMsg);

  // --- Dataset 1: granulometria de origen -- determina el grado ---
  const rawSourceSieves = params.body.sourceSieves;
  if (!Array.isArray(rawSourceSieves)) {
    return err(400, "sourceSieves es obligatorio (arreglo con los 11 tamices de granulometría de origen, cl. 7.2).");
  }
  const { sieves, error: sieveError } = normalizeSourceSieves(rawSourceSieves);
  if (sieveError) return err(400, sieveError);

  const sourceResults = computeSourcePercentages(sieves);
  const { grado, sums } = determineGrade(sourceResults);
  const gradoGrupo = getGradeGroup(grado);
  const machineConditions = getMachineConditions(grado);

  // --- Dataset 2: carga de ensayo -- BLOQUEANTE contra Tabla 1 ---
  const rawFractions = params.body.fractions;
  if (!Array.isArray(rawFractions)) {
    return err(400, "fractions es obligatorio (masas de la carga de ensayo preparada según Tabla 1 para el grado determinado).");
  }
  const fractionCheck = validateFractions(grado, rawFractions);
  if (!fractionCheck.ok) return err(400, fractionCheck.error as string);

  // --- cl. 9/10 -- P = (mi - mf)/mi * 100 ---
  const masaInicial = Number(params.body.masaInicial);
  const masaFinal = Number(params.body.masaFinal);
  if (!Number.isFinite(masaInicial)) return err(400, "masaInicial es obligatoria y debe ser numérica.");
  if (!Number.isFinite(masaFinal)) return err(400, "masaFinal es obligatoria y debe ser numérica.");

  const abrasion = computeAbrasionPercent(masaInicial, masaFinal);
  if (typeof abrasion !== "number") return err(400, abrasion.error);

  const calcNote = `Grado determinado por Anexo A: ${grado} (sumatoria ${sums[grado]}%, resto: ${Object.entries(sums)
    .filter(([g]) => Number(g) !== grado)
    .map(([g, s]) => `${g}=${s}%`)
    .join(", ")}). Grupo de comparabilidad (cl. 10, nota): ${gradoGrupo} -- no comparable con el otro grupo.`;

  // Creación atómica: ensayo + sourceSieves + fractions + EquipmentUsage.
  const created = await prisma.$transaction(async (tx) => {
    const la = await tx.losAngelesAbrasion.create({
      data: {
        sampleId,
        methodCode: params.body.methodCode ?? "NCh1369.Of2010",
        status: "DONE",
        gradoEnsayo: grado,
        gradoGrupo,
        esferasCount: machineConditions?.esferasCount ?? null,
        esferasMassG: machineConditions?.esferasMassG ?? null,
        revolucionesCount: machineConditions?.revolucionesCount ?? null,
        masaInicial,
        masaFinal,
        desgastePercent: abrasion,
        calcNote,
        notes: params.body.notes ?? null,
      },
    });

    await tx.losAngelesAbrasionSieve.createMany({
      data: sourceResults.map((s) => ({
        losAngelesAbrasionId: la.id,
        order: s.order,
        openingMm: s.openingMm,
        retainedMass: s.retainedMass,
        percentRetained: s.percentRetained,
      })),
    });

    await tx.losAngelesAbrasionFraction.createMany({
      data: fractionCheck.fractions.map((f, i) => ({
        losAngelesAbrasionId: la.id,
        order: i + 1,
        fractionLabel: f.label,
        upperOpeningMm: f.upperMm,
        lowerOpeningMm: f.lowerMm,
        massG: f.massG,
        targetMassG: f.targetG,
        toleranceG: f.toleranceG,
        diffG: f.diffG,
        ok: f.ok,
      })),
    });

    if (equipmentIds.length > 0) {
      await tx.equipmentUsage.createMany({
        data: equipmentIds.map((eqId) => ({
          equipmentId: eqId,
          entityType: "LOS_ANGELES_ABRASION",
          entityId: la.id,
        })),
      });
    }

    return tx.losAngelesAbrasion.findUnique({
      where: { id: la.id },
      include: {
        sourceSieves: { orderBy: { order: "asc" } },
        fractions: { orderBy: { order: "asc" } },
      },
    });
  });

  if (created) {
    await registerAudit({
      userId: params.userId,
      action: "CREATE",
      entityType: "LosAngelesAbrasion",
      entityId: created.id,
      previousValue: null,
      newValue: { ...created, equipmentIds },
    });
  }

  return { data: created };
}

// ---------------------------------------------------------------------
// GET /api/los-angeles-abrasions/:id
// ---------------------------------------------------------------------
export async function getLosAngelesAbrasionByIdService(idRaw: unknown): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const la = await prisma.losAngelesAbrasion.findUnique({
    where: { id },
    include: {
      sourceSieves: { orderBy: { order: "asc" } },
      fractions: { orderBy: { order: "asc" } },
    },
  });
  if (!la) return err(404, "Desgaste Los Ángeles no encontrado.");

  const equiposUsados = await prisma.equipmentUsage.findMany({
    where: { entityType: "LOS_ANGELES_ABRASION", entityId: id },
    include: {
      equipment: { select: { id: true, code: true, type: true, category: true, status: true } },
    },
  });

  return { data: { ...la, equiposUsados } };
}

// ---------------------------------------------------------------------
// GET /api/los-angeles-abrasions/sample/:sampleId
// ---------------------------------------------------------------------
export async function listLosAngelesAbrasionsBySampleService(sampleIdRaw: unknown): Promise<ServiceResult<any>> {
  const sampleId = parseId(sampleIdRaw);
  if (!sampleId) return err(400, "sampleId inválido.");

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return err(404, "Muestra no encontrada.");

  const list = await prisma.losAngelesAbrasion.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
    include: {
      sourceSieves: { orderBy: { order: "asc" } },
      fractions: { orderBy: { order: "asc" } },
    },
  });

  return { data: list };
}

// ---------------------------------------------------------------------
// POST /api/los-angeles-abrasions/:id/approve
// ---------------------------------------------------------------------
export async function approveLosAngelesAbrasionService(
  idRaw: unknown,
  userId: number,
  reason?: string
): Promise<ServiceResult<any>> {
  const id = parseId(idRaw);
  if (!id) return err(400, "id inválido.");

  const before = await prisma.losAngelesAbrasion.findUnique({ where: { id } });
  if (!before) return err(404, "Desgaste Los Ángeles no encontrado.");

  if (before.isApproved) return err(409, "Este registro ya estaba aprobado.");

  const updated = await prisma.losAngelesAbrasion.update({
    where: { id },
    data: { isApproved: true, approvedById: userId, approvedAt: new Date() },
  });

  await registerAudit({
    userId,
    action: "APPROVE",
    entityType: "LosAngelesAbrasion",
    entityId: updated.id,
    previousValue: before,
    newValue: updated,
    reason,
  });

  return { data: updated };
}
