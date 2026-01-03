// src/controllers/granulometry.controller.ts
import { Request, Response } from "express";
import prisma from "../prismaClient";
import {
  calculateGranulometry,
  GranulometrySieveInput,
  evaluateSoilSeriesQa,
  buildSoilCurveDataset,
} from "../utils/granulometryCalc";

function round3(n: number) {
  return Number(n.toFixed(3));
}

export const createGranulometry = async (req: Request, res: Response) => {
  try {
    const { sampleId, method, notes, sieves } = req.body as {
      sampleId: number;
      method?: string | null;
      notes?: string | null;
      sieves: Array<{
        order: number;
        sieveLabel: string;
        openingMm?: number | null;
        aperture?: number | null; // compat
        retainedMass: number;
      }>;
    };

    if (!sampleId || !Number.isFinite(Number(sampleId))) {
      return res.status(400).json({ message: "sampleId es obligatorio y debe ser numérico." });
    }
    if (!Array.isArray(sieves) || sieves.length === 0) {
      return res.status(400).json({ message: "sieves debe ser un arreglo con al menos 1 elemento." });
    }

    const sample = await prisma.sample.findUnique({
      where: { id: Number(sampleId) },
      select: { id: true },
    });
    if (!sample) return res.status(404).json({ message: "Muestra no encontrada." });

    const normalized = sieves
      .map((s) => {
        const mm = s.openingMm ?? s.aperture;
        return {
          order: Number(s.order),
          sieveLabel: String(s.sieveLabel ?? "").trim(),
          openingMm: mm === null || mm === undefined ? null : Number(mm),
          retainedMass: Number(s.retainedMass),
        };
      })
      .sort((a, b) => a.order - b.order);

    for (const s of normalized) {
      if (!Number.isFinite(s.order)) return res.status(400).json({ message: "order inválido." });
      if (!s.sieveLabel) return res.status(400).json({ message: "sieveLabel obligatorio." });
      if (!Number.isFinite(s.retainedMass) || s.retainedMass < 0) {
        return res.status(400).json({ message: "retainedMass inválido (>= 0)." });
      }
      if (s.openingMm !== null && (!Number.isFinite(s.openingMm) || s.openingMm <= 0)) {
        return res.status(400).json({ message: "openingMm inválido (debe ser > 0 o null)." });
      }
    }

    const totalDryMass = normalized.reduce((acc, s) => acc + s.retainedMass, 0);
    if (!(totalDryMass > 0)) {
      return res.status(400).json({ message: "Masa total inválida (totalDryMass <= 0)." });
    }

    const sievesForCalc: GranulometrySieveInput[] = normalized.map((s) => ({
      order: s.order,
      sieveLabel: s.sieveLabel,
      openingMm: s.openingMm,
      retainedMass: s.retainedMass,
    }));

    const calc = calculateGranulometry(sievesForCalc, totalDryMass);

    // QA serie suelo (classificationReady con #4/#10/#40/#200)
    const qa = evaluateSoilSeriesQa(
      normalized.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm }))
    );

    // calcNotes final (suma mensajes QA)
    const qaNotes = qa.messages.length ? ` | ${qa.messages.join(" ")}` : "";
    const calcNotes = (calc.calcNotes ?? "") + qaNotes;

    const created = await prisma.$transaction(async (tx) => {
      const g = await tx.granulometry.create({
        data: {
          sampleId: Number(sampleId),
          method: method ?? null,
          notes: notes ?? null,
          totalDryMass: round3(totalDryMass),

          d10: calc.d10 ?? null,
          d30: calc.d30 ?? null,
          d60: calc.d60 ?? null,
          cu: calc.cu ?? null,
          cc: calc.cc ?? null,
          errorPercent: calc.errorPercent ?? null,
          calcNotes: calcNotes || null,
        },
      });

      const calcByOrder = new Map<number, { pr: number; pp: number }>();
      for (const s of calc.sieves) calcByOrder.set(s.order, { pr: s.percentRetained, pp: s.percentPassing });

      await tx.granulometrySieve.createMany({
        data: normalized.map((s) => {
          const c = calcByOrder.get(s.order);
          return {
            granulometryId: g.id,
            order: s.order,
            sieveLabel: s.sieveLabel,
            openingMm: s.openingMm,
            retainedMass: s.retainedMass,
            percentRetained: c ? c.pr : 0,
            percentPassing: c ? c.pp : 0,
          };
        }),
      });

      return tx.granulometry.findUnique({
        where: { id: g.id },
        include: { sieves: { orderBy: { order: "asc" } } },
      });
    });

    // dataset curva estándar suelo (excluye 1/2" y fondo)
    const curve = buildSoilCurveDataset(
      (created?.sieves ?? []).map((s) => ({
        order: s.order,
        sieveLabel: s.sieveLabel,
        openingMm: s.openingMm,
        percentPassing: s.percentPassing,
      }))
    );

    return res.status(201).json({
      message: "OK",
      data: created,
      qa,
      curve,
    });
  } catch (err: any) {
    console.error("❌ createGranulometry error:", err);
    return res.status(500).json({
      message: "Error interno del servidor",
      debug: { name: err?.name, message: err?.message, code: err?.code, meta: err?.meta },
    });
  }
};

export const getGranulometryById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "id inválido." });

    const row = await prisma.granulometry.findUnique({
      where: { id },
      include: { sieves: { orderBy: { order: "asc" } } },
    });

    if (!row) return res.status(404).json({ message: "Granulometría no encontrada." });

    const qa = evaluateSoilSeriesQa(row.sieves.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm })));
    const curve = buildSoilCurveDataset(
      row.sieves.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm, percentPassing: s.percentPassing }))
    );

    return res.json({ message: "OK", data: row, qa, curve });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getGranulometriesBySample = async (req: Request, res: Response) => {
  try {
    const sampleId = Number(req.params.sampleId);
    if (!Number.isFinite(sampleId) || sampleId <= 0) {
      return res.status(400).json({ message: "sampleId inválido." });
    }

    const rows = await prisma.granulometry.findMany({
      where: { sampleId },
      orderBy: { createdAt: "desc" },
      include: { sieves: { orderBy: { order: "asc" } } },
    });

    return res.json({ message: "OK", data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const listGranulometries = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.granulometry.findMany({
      orderBy: { createdAt: "desc" },
      include: { sieves: { orderBy: { order: "asc" } } },
      take: 50,
    });

    return res.json({ message: "OK", data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const recalculateGranulometry = async (req: Request, res: Response) => {
  try {
    const granulometryId = Number(req.params.id);
    if (!Number.isFinite(granulometryId) || granulometryId <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const granulometry = await prisma.granulometry.findUnique({
      where: { id: granulometryId },
      include: { sieves: { orderBy: { order: "asc" } } },
    });

    if (!granulometry) return res.status(404).json({ message: "Granulometría no encontrada" });

    const totalDryMass = granulometry.totalDryMass;
    if (!(totalDryMass > 0)) return res.status(400).json({ message: "totalDryMass inválido en cabecera" });

    const sievesForCalc: GranulometrySieveInput[] = granulometry.sieves.map((s) => ({
      order: s.order,
      sieveLabel: s.sieveLabel,
      openingMm: s.openingMm,
      retainedMass: s.retainedMass,
    }));

    const calc = calculateGranulometry(sievesForCalc, totalDryMass);

    const qa = evaluateSoilSeriesQa(
      granulometry.sieves.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm }))
    );
    const qaNotes = qa.messages.length ? ` | ${qa.messages.join(" ")}` : "";
    const calcNotes = (calc.calcNotes ?? "") + qaNotes;

    await prisma.$transaction(async (tx) => {
      await tx.granulometry.update({
        where: { id: granulometryId },
        data: {
          d10: calc.d10 ?? null,
          d30: calc.d30 ?? null,
          d60: calc.d60 ?? null,
          cu: calc.cu ?? null,
          cc: calc.cc ?? null,
          errorPercent: calc.errorPercent ?? null,
          calcNotes: calcNotes || null,
        },
      });

      const calcByOrder = new Map<number, { pr: number; pp: number }>();
      for (const s of calc.sieves) calcByOrder.set(s.order, { pr: s.percentRetained, pp: s.percentPassing });

      for (const dbSieve of granulometry.sieves) {
        const c = calcByOrder.get(dbSieve.order);
        if (!c) continue;
        await tx.granulometrySieve.update({
          where: { id: dbSieve.id },
          data: { percentRetained: c.pr, percentPassing: c.pp },
        });
      }
    });

    const updated = await prisma.granulometry.findUnique({
      where: { id: granulometryId },
      include: { sieves: { orderBy: { order: "asc" } } },
    });

    const curve = buildSoilCurveDataset(
      (updated?.sieves ?? []).map((s) => ({
        order: s.order,
        sieveLabel: s.sieveLabel,
        openingMm: s.openingMm,
        percentPassing: s.percentPassing,
      }))
    );

    return res.json({
      message: "OK",
      qa: { errorPercent: calc.errorPercent, warning: (calc.errorPercent ?? 0) > 0.5, ...qa },
      curve,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno al recalcular granulometría" });
  }
};

/**
 * PUT /granulometries/:id/sieves
 * Actualiza retainedMass/openingMm/label/order de tamices existentes (o reemplazo completo)
 * y recalcula automáticamente.
 */
export const updateGranulometrySieves = async (req: Request, res: Response) => {
  try {
    const granulometryId = Number(req.params.id);
    if (!Number.isFinite(granulometryId) || granulometryId <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const { sieves } = req.body as {
      sieves: Array<{
        order: number;
        sieveLabel: string;
        openingMm?: number | null;
        aperture?: number | null;
        retainedMass: number;
      }>;
    };

    if (!Array.isArray(sieves) || sieves.length === 0) {
      return res.status(400).json({ message: "sieves debe ser un arreglo con al menos 1 elemento." });
    }

    const existing = await prisma.granulometry.findUnique({
      where: { id: granulometryId },
      include: { sieves: { orderBy: { order: "asc" } } },
    });
    if (!existing) return res.status(404).json({ message: "Granulometría no encontrada" });

    const normalized = sieves
      .map((s) => {
        const mm = s.openingMm ?? s.aperture;
        return {
          order: Number(s.order),
          sieveLabel: String(s.sieveLabel ?? "").trim(),
          openingMm: mm === null || mm === undefined ? null : Number(mm),
          retainedMass: Number(s.retainedMass),
        };
      })
      .sort((a, b) => a.order - b.order);

    for (const s of normalized) {
      if (!Number.isFinite(s.order)) return res.status(400).json({ message: "order inválido." });
      if (!s.sieveLabel) return res.status(400).json({ message: "sieveLabel obligatorio." });
      if (!Number.isFinite(s.retainedMass) || s.retainedMass < 0) {
        return res.status(400).json({ message: "retainedMass inválido (>= 0)." });
      }
      if (s.openingMm !== null && (!Number.isFinite(s.openingMm) || s.openingMm <= 0)) {
        return res.status(400).json({ message: "openingMm inválido (debe ser > 0 o null)." });
      }
    }

    const totalDryMass = existing.totalDryMass;
    if (!(totalDryMass > 0)) return res.status(400).json({ message: "totalDryMass inválido en cabecera" });

    const sievesForCalc: GranulometrySieveInput[] = normalized.map((s) => ({
      order: s.order,
      sieveLabel: s.sieveLabel,
      openingMm: s.openingMm,
      retainedMass: s.retainedMass,
    }));

    const calc = calculateGranulometry(sievesForCalc, totalDryMass);

    const qa = evaluateSoilSeriesQa(normalized.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm })));
    const qaNotes = qa.messages.length ? ` | ${qa.messages.join(" ")}` : "";
    const calcNotes = (calc.calcNotes ?? "") + qaNotes;

    await prisma.$transaction(async (tx) => {
      // reemplazo completo: borra tamices y recrea (simple y robusto)
      await tx.granulometrySieve.deleteMany({ where: { granulometryId } });

      await tx.granulometry.update({
        where: { id: granulometryId },
        data: {
          d10: calc.d10 ?? null,
          d30: calc.d30 ?? null,
          d60: calc.d60 ?? null,
          cu: calc.cu ?? null,
          cc: calc.cc ?? null,
          errorPercent: calc.errorPercent ?? null,
          calcNotes: calcNotes || null,
        },
      });

      const calcByOrder = new Map<number, { pr: number; pp: number }>();
      for (const s of calc.sieves) calcByOrder.set(s.order, { pr: s.percentRetained, pp: s.percentPassing });

      await tx.granulometrySieve.createMany({
        data: normalized.map((s) => {
          const c = calcByOrder.get(s.order);
          return {
            granulometryId,
            order: s.order,
            sieveLabel: s.sieveLabel,
            openingMm: s.openingMm,
            retainedMass: s.retainedMass,
            percentRetained: c ? c.pr : 0,
            percentPassing: c ? c.pp : 0,
          };
        }),
      });
    });

    const updated = await prisma.granulometry.findUnique({
      where: { id: granulometryId },
      include: { sieves: { orderBy: { order: "asc" } } },
    });

    const curve = buildSoilCurveDataset(
      (updated?.sieves ?? []).map((s) => ({
        order: s.order,
        sieveLabel: s.sieveLabel,
        openingMm: s.openingMm,
        percentPassing: s.percentPassing,
      }))
    );

    return res.json({
      message: "OK",
      qa: { errorPercent: calc.errorPercent, warning: (calc.errorPercent ?? 0) > 0.5, ...qa },
      curve,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno al actualizar tamices" });
  }
};
