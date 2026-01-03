import type { PrismaClient } from "@prisma/client";
import { calculateProctorFromDb } from "../utils/proctorCalc";

type CreateProctorDTO = {
  methodCode?: string | null;
  methodName?: string | null;
  layers?: number | null;
  blowsPerLayer?: number | null;
  notes?: string | null;
};

type AddPointDTO = {
  order?: number | null;
  moldId: number;
  wetMassMoldPlusSoilG: number;
  waterContentPercent: number;
};

export async function createProctorForSample(prisma: PrismaClient, sampleId: number, dto: CreateProctorDTO) {
  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) throw new Error("Sample no existe");

  return prisma.proctor.create({
    data: {
      sampleId,
      methodCode: dto.methodCode ?? null,
      methodName: dto.methodName ?? null,
      layers: dto.layers ?? null,
      blowsPerLayer: dto.blowsPerLayer ?? null,
      notes: dto.notes ?? null,
      status: "DRAFT",
      curveFit: "PARABOLA",
    },
  });
}

export async function listProctorsForSample(prisma: PrismaClient, sampleId: number) {
  return prisma.proctor.findMany({
    where: { sampleId },
    orderBy: { id: "desc" },
  });
}

export async function getProctorFull(prisma: PrismaClient, proctorId: number) {
  return prisma.proctor.findUnique({
    where: { id: proctorId },
    include: {
      points: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { mold: true } },
    },
  });
}

export async function addPointToProctor(prisma: PrismaClient, proctorId: number, dto: AddPointDTO) {
  const proctor = await prisma.proctor.findUnique({ where: { id: proctorId } });
  if (!proctor) throw new Error("Proctor no existe");

  const mold = await prisma.mold.findUnique({ where: { id: dto.moldId } });
  if (!mold) throw new Error("Mold no existe");
  if (mold.tareMassG === null || mold.tareMassG === undefined) throw new Error("Mold sin tara (tareMassG)");

  // Si order viene null, lo autocalculamos (1..n)
  let order = dto.order ?? null;
  if (!order) {
    const count = await prisma.proctorPoint.count({ where: { proctorId } });
    order = count + 1;
  }

  return prisma.proctorPoint.create({
    data: {
      proctorId,
      order,
      moldId: dto.moldId,
      wetMassMoldPlusSoilG: dto.wetMassMoldPlusSoilG,
      waterContentPercent: dto.waterContentPercent,
    },
  });
}

export async function listPointsForProctor(prisma: PrismaClient, proctorId: number) {
  return prisma.proctorPoint.findMany({
    where: { proctorId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { mold: true },
  });
}

export async function recalcProctorAndPersist(prisma: PrismaClient, proctorId: number) {
  // calcula (OMC, MDD, curva, chartJson) leyendo mold+points
  const calc = await calculateProctorFromDb(proctorId);

  // persiste resultados en proctor
  const updated = await prisma.proctor.update({
    where: { id: proctorId },
    data: {
      omcPercent: calc.omcPercent,
      mddDryDensity: calc.mddDryDensity,
      chartJson: calc.chartJson,
      // opcional: chartUrl, status, etc.
    },
  });

  return { proctor: updated, calc };
}
