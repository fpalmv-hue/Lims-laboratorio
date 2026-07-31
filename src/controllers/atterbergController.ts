import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcIP(ll: number | null, lp: number | null): number | null {
  if (ll === null) return null;
  if (lp === null) return null; // NP => IP null
  const ip = ll - lp;
  return Number.isFinite(ip) ? ip : null;
}

/**
 * POST /api/samples/:sampleId/atterberg
 * Crea (si no existe) el Atterberg de la muestra (relación 1:1)
 */
export async function createAtterberg(req: AuthRequest, res: Response) {
  try {
    const sampleId = Number(req.params.sampleId);
    if (!Number.isFinite(sampleId)) {
      return res.status(400).json({ message: "sampleId inválido" });
    }

    // Verifica sample
    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    if (!sample) return res.status(404).json({ message: "Sample no existe" });

    // Evitar duplicado 1:1
    const existing = await prisma.atterberg.findUnique({ where: { sampleId } });
    if (existing) {
      return res.status(409).json({
        message: "Atterberg ya existe para esta muestra (1:1). Usa PUT.",
        data: existing,
      });
    }

    const method = req.body.method ?? null;
    const ll = toNumberOrNull(req.body.liquidLimit);
    const lp = toNumberOrNull(req.body.plasticLimit); // null = NP
    const notes = req.body.notes ?? null;

    // Validación mínima: LL recomendado si se registra Atterberg
    if (ll === null) {
      return res.status(400).json({ message: "liquidLimit (LL) es obligatorio" });
    }

    const ip = calcIP(ll, lp);

    const created = await prisma.atterberg.create({
      data: {
        sampleId,
        method,
        liquidLimit: ll,
        plasticLimit: lp,
        plasticityIdx: ip,
        notes,
      },
    });

    // Trazabilidad ISO 17025: registrar la creación del Atterberg.
    if (req.user) {
      await registerAudit({
        userId: req.user.id,
        action: "CREATE",
        entityType: "Atterberg",
        entityId: created.id,
        previousValue: null,
        newValue: created,
      });
    }

    return res.status(201).json({ message: "Atterberg creado", data: created });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

/**
 * PUT /api/samples/:sampleId/atterberg
 * Upsert (crea o actualiza) el Atterberg de la muestra.
 */
export async function upsertAtterberg(req: AuthRequest, res: Response) {
  try {
    const sampleId = Number(req.params.sampleId);
    if (!Number.isFinite(sampleId)) {
      return res.status(400).json({ message: "sampleId inválido" });
    }

    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    if (!sample) return res.status(404).json({ message: "Sample no existe" });

    const ll = toNumberOrNull(req.body.liquidLimit);
    const lp = toNumberOrNull(req.body.plasticLimit); // null = NP

    // En PUT permitimos que no venga LL/LP/method/notes si solo quieres
    // editar algunos campos -- cada campo omitido cae de vuelta al valor
    // ya guardado (current), en vez de sobreescribirse con null.
    const current = await prisma.atterberg.findUnique({ where: { sampleId } });

    const finalLL = ll !== null ? ll : current?.liquidLimit ?? null;
    const finalLP = (req.body.plasticLimit !== undefined) ? lp : (current?.plasticLimit ?? null);
    // Nota: si envías plasticLimit: null => queda NP intencionalmente

    const finalMethod = (req.body.method !== undefined) ? req.body.method : (current?.method ?? null);
    const finalNotes = (req.body.notes !== undefined) ? req.body.notes : (current?.notes ?? null);
    // Mismo criterio: enviar method/notes explícitamente en null SÍ los borra
    // a propósito; omitirlos del body preserva lo que ya había guardado.

    if (finalLL === null) {
      return res.status(400).json({
        message: "liquidLimit (LL) es obligatorio (o ya debe existir guardado)",
      });
    }

    const ip = calcIP(finalLL, finalLP);

    const saved = await prisma.atterberg.upsert({
      where: { sampleId },
      create: {
        sampleId,
        method: finalMethod,
        liquidLimit: finalLL,
        plasticLimit: finalLP,
        plasticityIdx: ip,
        notes: finalNotes,
      },
      update: {
        method: finalMethod,
        liquidLimit: finalLL,
        plasticLimit: finalLP,
        plasticityIdx: ip,
        notes: finalNotes,
      },
    });

    // Trazabilidad ISO 17025: registrar CREATE si no existía antes
    // (current === null), o UPDATE con el estado previo si ya existía.
    if (req.user) {
      await registerAudit({
        userId: req.user.id,
        action: current ? "UPDATE" : "CREATE",
        entityType: "Atterberg",
        entityId: saved.id,
        previousValue: current,
        newValue: saved,
        reason: req.body.reason,
      });
    }

    return res.status(200).json({ message: "Atterberg guardado", data: saved });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

/**
 * GET /api/samples/:sampleId/atterberg
 */
export async function getAtterbergBySample(req: AuthRequest, res: Response) {
  try {
    const sampleId = Number(req.params.sampleId);
    if (!Number.isFinite(sampleId)) {
      return res.status(400).json({ message: "sampleId inválido" });
    }

    const atterberg = await prisma.atterberg.findUnique({ where: { sampleId } });
    if (!atterberg) return res.status(404).json({ message: "Atterberg no encontrado" });

    return res.status(200).json({ message: "OK", data: atterberg });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
