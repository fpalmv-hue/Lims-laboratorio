// src/controllers/granulometry.controller.ts
import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";
import {
  calculateGranulometry,
  GranulometrySieveInput,
  GranulometryMassBalanceInput,
  GranulometryFractionLabel,
  evaluateSoilSeriesQa,
  buildSoilCurveDataset,
} from "../utils/granulometryCalc";

function round3(n: number) {
  return Number(n.toFixed(3));
}

// Extrae y valida los 7 campos del balance de masas MOP 8.102.1 desde el
// body. Todos son opcionales (una muestra 100% fina nunca tendra D/D',
// y viceversa es raro pero no imposible), pero si vienen deben ser
// numeros validos (>= 0) o null explicito.
function parseMassBalanceFromBody(body: any): { balance: GranulometryMassBalanceInput; error: string | null } {
  const keys = [
    "massOver5mm_D",
    "massOver5mm_Dprime",
    "residueOver5mm",
    "massUnder5mm_C",
    "massUnder5mm_Cprime",
    "massUnder5mm_CprimeWashed",
    "residueUnder5mm",
  ] as const;

  const out: any = {};
  for (const k of keys) {
    const v = body?.[k];
    if (v === undefined || v === null || v === "") {
      out[k] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return { balance: out, error: `${k} invalido (debe ser numero >= 0 o null).` };
    }
    out[k] = n;
  }
  return { balance: out as GranulometryMassBalanceInput, error: null };
}

function normalizeSieveInput(
  s: {
    order: number;
    sieveLabel: string;
    openingMm?: number | null;
    aperture?: number | null;
    retainedMass: number;
    fraction?: string;
  }
): { sieve: (GranulometrySieveInput & { granulometryId?: number }) | null; error: string | null } {
  const mm = s.openingMm ?? s.aperture;
  const fraction = s.fraction;

  if (fraction !== "OVER_5MM" && fraction !== "UNDER_5MM") {
    return {
      sieve: null,
      error: `sieveLabel "${s.sieveLabel ?? "?"}": fraction obligatorio, debe ser "OVER_5MM" o "UNDER_5MM" (MOP 8.102.1 §5.4-5.8).`,
    };
  }

  const order = Number(s.order);
  const sieveLabel = String(s.sieveLabel ?? "").trim();
  const openingMm = mm === null || mm === undefined ? null : Number(mm);
  const retainedMass = Number(s.retainedMass);

  if (!Number.isFinite(order)) return { sieve: null, error: "order invalido." };
  if (!sieveLabel) return { sieve: null, error: "sieveLabel obligatorio." };
  if (!Number.isFinite(retainedMass) || retainedMass < 0) {
    return { sieve: null, error: `sieveLabel "${sieveLabel}": retainedMass invalido (>= 0).` };
  }
  if (openingMm !== null && (!Number.isFinite(openingMm) || openingMm <= 0)) {
    return { sieve: null, error: `sieveLabel "${sieveLabel}": openingMm invalido (debe ser > 0 o null).` };
  }

  return {
    sieve: { order, sieveLabel, openingMm, retainedMass, fraction: fraction as GranulometryFractionLabel },
    error: null,
  };
}

export const createGranulometry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { sampleId, method, notes, sieves } = req.body as {
      sampleId: number;
      method?: string | null;
      notes?: string | null;
      sieves: Array<{
        order: number;
        sieveLabel: string;
        openingMm?: number | null;
        aperture?: number | null;
        retainedMass: number;
        fraction?: string;
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

    const { balance, error: balanceError } = parseMassBalanceFromBody(req.body);
    if (balanceError) return res.status(400).json({ message: balanceError });

    const normalized: GranulometrySieveInput[] = [];
    for (const raw of sieves) {
      const { sieve, error } = normalizeSieveInput(raw);
      if (error) return res.status(400).json({ message: error });
      normalized.push(sieve as GranulometrySieveInput);
    }
    normalized.sort((a, b) => a.order - b.order);

    const totalDryMass = normalized.reduce((acc, s) => acc + s.retainedMass, 0);
    if (!(totalDryMass > 0)) {
      return res.status(400).json({ message: "Masa total inválida (totalDryMass <= 0)." });
    }

    const calc = calculateGranulometry(normalized, totalDryMass, balance);

    // QA serie suelo (classificationReady con #4/#10/#40/#200)
    const qa = evaluateSoilSeriesQa(
      normalized.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm }))
    );

    // calcNotes final (suma mensajes QA de serie + mensajes QA de fraccion)
    const allMessages = [...qa.messages, ...calc.fractionQa.messages];
    const qaNotes = allMessages.length ? ` | ${allMessages.join(" ")}` : "";
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

          massOver5mm_D: balance.massOver5mm_D,
          massOver5mm_Dprime: balance.massOver5mm_Dprime,
          residueOver5mm: balance.residueOver5mm,
          massUnder5mm_C: balance.massUnder5mm_C,
          massUnder5mm_Cprime: balance.massUnder5mm_Cprime,
          massUnder5mm_CprimeWashed: balance.massUnder5mm_CprimeWashed,
          residueUnder5mm: balance.residueUnder5mm,

          errorPercentOver5mm: calc.fractionQa.errorPercentOver5mm,
          errorPercentUnder5mm: calc.fractionQa.errorPercentUnder5mm,
          qaStatus: calc.fractionQa.qaStatus,
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
            fraction: s.fraction,
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

    // Trazabilidad ISO 17025: registrar la creación de la granulometría
    // (fuera de la transacción principal, a propósito -- ver diseño en
    // src/utils/auditLog.ts: un fallo acá no debe tumbar el dato ya creado).
    if (created) {
      await registerAudit({
        userId,
        action: "CREATE",
        entityType: "Granulometry",
        entityId: created.id,
        previousValue: null,
        newValue: created,
      });
    }

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
      fractionQa: calc.fractionQa,
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

export const getGranulometryById = async (req: AuthRequest, res: Response) => {
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

export const getGranulometriesBySample = async (req: AuthRequest, res: Response) => {
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

export const listGranulometries = async (_req: AuthRequest, res: Response) => {
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

export const recalculateGranulometry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const granulometryId = Number(req.params.id);
    if (!Number.isFinite(granulometryId) || granulometryId <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const granulometry = await prisma.granulometry.findUnique({
      where: { id: granulometryId },
      include: { sieves: { orderBy: { order: "asc" } } },
    });

    if (!granulometry) return res.status(404).json({ message: "Granulometría no encontrada" });

    // Regla ISO 17025: si ya estaba aprobada, reason es obligatorio, y el
    // recálculo revierte automáticamente isApproved a false.
    const guardMsg = assertReasonIfApproved(granulometry.isApproved, req.body?.reason);
    if (guardMsg) {
      return res.status(400).json({ message: guardMsg });
    }

    const totalDryMass = granulometry.totalDryMass;
    if (!(totalDryMass > 0)) return res.status(400).json({ message: "totalDryMass inválido en cabecera" });

    // Recalculate usa el balance de masas YA GUARDADO en el registro
    // (no viene en el body -- para cambiar D/D'/C/C'/C'' hay que pasar
    // por PUT /:id/sieves).
    const balance: GranulometryMassBalanceInput = {
      massOver5mm_D: granulometry.massOver5mm_D,
      massOver5mm_Dprime: granulometry.massOver5mm_Dprime,
      residueOver5mm: granulometry.residueOver5mm,
      massUnder5mm_C: granulometry.massUnder5mm_C,
      massUnder5mm_Cprime: granulometry.massUnder5mm_Cprime,
      massUnder5mm_CprimeWashed: granulometry.massUnder5mm_CprimeWashed,
      residueUnder5mm: granulometry.residueUnder5mm,
    };

    const sievesForCalc: GranulometrySieveInput[] = granulometry.sieves.map((s) => ({
      order: s.order,
      sieveLabel: s.sieveLabel,
      openingMm: s.openingMm,
      retainedMass: s.retainedMass,
      fraction: s.fraction as GranulometryFractionLabel,
    }));

    const calc = calculateGranulometry(sievesForCalc, totalDryMass, balance);

    const qa = evaluateSoilSeriesQa(
      granulometry.sieves.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm }))
    );
    const allMessages = [...qa.messages, ...calc.fractionQa.messages];
    const qaNotes = allMessages.length ? ` | ${allMessages.join(" ")}` : "";
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
          errorPercentOver5mm: calc.fractionQa.errorPercentOver5mm,
          errorPercentUnder5mm: calc.fractionQa.errorPercentUnder5mm,
          qaStatus: calc.fractionQa.qaStatus,
          ...approvalResetIfNeeded(granulometry.isApproved),
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

    // Trazabilidad ISO 17025: registrar el recálculo, con el estado
    // completo (cabecera + tamices) antes y después.
    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Granulometry",
      entityId: granulometryId,
      previousValue: granulometry,
      newValue: updated,
      reason: req.body?.reason,
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
      qa,
      fractionQa: calc.fractionQa,
      curve,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno al recalcular granulometría" });
  }
};

/**
 * PUT /granulometries/:id/sieves
 * Actualiza retainedMass/openingMm/label/order/fraction de tamices
 * (reemplazo completo) y, opcionalmente, el balance de masas D/D'/C/C'/C''
 * si viene en el body (partial update -- si un campo no viene, se
 * conserva el valor existente). Recalcula automáticamente.
 */
export const updateGranulometrySieves = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const granulometryId = Number(req.params.id);
    if (!Number.isFinite(granulometryId) || granulometryId <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const { sieves, reason } = req.body as {
      sieves: Array<{
        order: number;
        sieveLabel: string;
        openingMm?: number | null;
        aperture?: number | null;
        retainedMass: number;
        fraction?: string;
      }>;
      reason?: string;
    };

    if (!Array.isArray(sieves) || sieves.length === 0) {
      return res.status(400).json({ message: "sieves debe ser un arreglo con al menos 1 elemento." });
    }

    const existing = await prisma.granulometry.findUnique({
      where: { id: granulometryId },
      include: { sieves: { orderBy: { order: "asc" } } },
    });
    if (!existing) return res.status(404).json({ message: "Granulometría no encontrada" });

    // Regla ISO 17025: si ya estaba aprobada, reason es obligatorio, y el
    // reemplazo de tamices revierte automáticamente isApproved a false.
    const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
    if (guardMsg) {
      return res.status(400).json({ message: guardMsg });
    }

    const { balance: bodyBalance, error: balanceError } = parseMassBalanceFromBody(req.body);
    if (balanceError) return res.status(400).json({ message: balanceError });

    // Partial update del balance: si el body no trajo un campo (quedo
    // null en bodyBalance porque no vino), se conserva el valor existente.
    const balance: GranulometryMassBalanceInput = {
      massOver5mm_D: req.body?.massOver5mm_D !== undefined ? bodyBalance.massOver5mm_D : existing.massOver5mm_D,
      massOver5mm_Dprime:
        req.body?.massOver5mm_Dprime !== undefined ? bodyBalance.massOver5mm_Dprime : existing.massOver5mm_Dprime,
      residueOver5mm: req.body?.residueOver5mm !== undefined ? bodyBalance.residueOver5mm : existing.residueOver5mm,
      massUnder5mm_C:
        req.body?.massUnder5mm_C !== undefined ? bodyBalance.massUnder5mm_C : existing.massUnder5mm_C,
      massUnder5mm_Cprime:
        req.body?.massUnder5mm_Cprime !== undefined ? bodyBalance.massUnder5mm_Cprime : existing.massUnder5mm_Cprime,
      massUnder5mm_CprimeWashed:
        req.body?.massUnder5mm_CprimeWashed !== undefined
          ? bodyBalance.massUnder5mm_CprimeWashed
          : existing.massUnder5mm_CprimeWashed,
      residueUnder5mm:
        req.body?.residueUnder5mm !== undefined ? bodyBalance.residueUnder5mm : existing.residueUnder5mm,
    };

    const normalized: GranulometrySieveInput[] = [];
    for (const raw of sieves) {
      const { sieve, error } = normalizeSieveInput(raw);
      if (error) return res.status(400).json({ message: error });
      normalized.push(sieve as GranulometrySieveInput);
    }
    normalized.sort((a, b) => a.order - b.order);

    const totalDryMass = existing.totalDryMass;
    if (!(totalDryMass > 0)) return res.status(400).json({ message: "totalDryMass inválido en cabecera" });

    const calc = calculateGranulometry(normalized, totalDryMass, balance);

    const qa = evaluateSoilSeriesQa(normalized.map((s) => ({ order: s.order, sieveLabel: s.sieveLabel, openingMm: s.openingMm })));
    const allMessages = [...qa.messages, ...calc.fractionQa.messages];
    const qaNotes = allMessages.length ? ` | ${allMessages.join(" ")}` : "";
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

          massOver5mm_D: balance.massOver5mm_D,
          massOver5mm_Dprime: balance.massOver5mm_Dprime,
          residueOver5mm: balance.residueOver5mm,
          massUnder5mm_C: balance.massUnder5mm_C,
          massUnder5mm_Cprime: balance.massUnder5mm_Cprime,
          massUnder5mm_CprimeWashed: balance.massUnder5mm_CprimeWashed,
          residueUnder5mm: balance.residueUnder5mm,

          errorPercentOver5mm: calc.fractionQa.errorPercentOver5mm,
          errorPercentUnder5mm: calc.fractionQa.errorPercentUnder5mm,
          qaStatus: calc.fractionQa.qaStatus,

          ...approvalResetIfNeeded(existing.isApproved),
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
            fraction: s.fraction,
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

    // Trazabilidad ISO 17025: esto reemplaza TODOS los tamices (borra y
    // recrea), así que el previousValue completo es especialmente
    // importante acá -- es la única forma de reconstruir qué había antes
    // de un reemplazo total.
    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Granulometry",
      entityId: granulometryId,
      previousValue: existing,
      newValue: updated,
      reason,
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
      qa,
      fractionQa: calc.fractionQa,
      curve,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno al actualizar tamices" });
  }
};

/**
 * POST /granulometries/:id/approve
 * Aprueba la granulometría (evento formal, separado de recalculate/sieves).
 * Requiere rol ADMIN, JEFE o CALIDAD.
 */
export const approveGranulometry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const granulometryId = Number(req.params.id);
    if (!Number.isFinite(granulometryId) || granulometryId <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const before = await prisma.granulometry.findUnique({ where: { id: granulometryId } });
    if (!before) return res.status(404).json({ message: "Granulometría no encontrada" });

    if (before.isApproved) {
      return res.status(409).json({ message: "Esta granulometría ya estaba aprobada" });
    }

    // No permitir aprobar un ensayo NO_CONFORME (norma exige repetir el
    // ensaye si se excede tolerancia -- aprobar seria certificar un
    // resultado que la propia norma dice que hay que rehacer).
    if (before.qaStatus === "NO_CONFORME") {
      return res.status(409).json({
        message:
          "No se puede aprobar: el cierre de masa por fracción excede la tolerancia MOP 8.102.1 §5.10 (qaStatus = NO_CONFORME). El ensaye debe repetirse.",
      });
    }

    const updated = await prisma.granulometry.update({
      where: { id: granulometryId },
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
      entityType: "Granulometry",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: req.body?.reason,
    });

    return res.json({ message: "Granulometría aprobada", data: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno al aprobar granulometría" });
  }
};
