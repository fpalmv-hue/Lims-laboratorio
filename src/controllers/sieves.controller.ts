// src/controllers/sieves.controller.ts
//
// Catálogo de tamices individuales como instrumento trazable.
// Mismo patrón que molds.controller.ts (Fase 1):
// - code/status viven en Equipment padre (1:1, category NORMATIVE).
// - Crear Sieve = crear Equipment + Sieve en $transaction.
// - POST /:id/verify (no /calibrate — tamices no tienen calibración
//   externa acreditada, solo verificación interna, confirmado por Felipe).
// - Periodicidad verificación: 6 meses (confirmado por Felipe).
//
// astmDesignation: nomenclatura normativa del tamiz (ej: "N°4", "N°200",
//   "3/4\""), coincide con los sieveLabel de granulometryCalc.ts.
// openingMm: abertura exacta en mm según ASTM E11 / MOP 8.102.1.
//   Valores correctos para Mecánica de Suelos MOP 8.102.1:
//   N°4=5, N°10=2, N°40=0.425, N°200=0.075 (NO redondeos de tabla).
import type { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ----------------------------------------------------
// GET /api/sieves?active=true
// ----------------------------------------------------
export async function listSieves(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const sieves = await prisma.sieve.findMany({
      include: { equipment: true },
      where: onlyActive ? { equipment: { status: "ACTIVE" } } : undefined,
      orderBy: { openingMm: "desc" }, // de mayor a menor abertura (orden lógico del juego)
    });

    return res.json({ message: "OK", data: sieves });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// GET /api/sieves/:id
// ----------------------------------------------------
export async function getSieveById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const sieve = await prisma.sieve.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!sieve) return res.status(404).json({ message: "Tamiz no encontrado." });

    return res.json({ message: "OK", data: sieve });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sieves
// Body: { code, astmDesignation, openingMm, description? }
// Crea Equipment (type=SIEVE, category=NORMATIVE) + Sieve en $transaction.
// ----------------------------------------------------
export async function createSieve(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const { code, astmDesignation, openingMm, description } = req.body as {
      code?: string;
      astmDesignation?: string;
      openingMm?: number;
      description?: string;
    };

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "code es obligatorio." });
    }
    if (!astmDesignation || typeof astmDesignation !== "string" || !astmDesignation.trim()) {
      return res.status(400).json({ message: "astmDesignation es obligatorio (ej: \"N°4\", \"N°200\", \"3/4\\\"\")." });
    }
    if (!Number.isFinite(Number(openingMm)) || Number(openingMm) <= 0) {
      return res.status(400).json({ message: "openingMm es obligatorio y debe ser numérico > 0." });
    }

    const existing = await prisma.equipment.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un equipo con ese código." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const equipment = await tx.equipment.create({
        data: {
          code: code.trim(),
          type: "SIEVE",
          category: "NORMATIVE",
          status: "ACTIVE",
          description: description ?? null,
        },
      });
      const sieve = await tx.sieve.create({
        data: {
          equipmentId: equipment.id,
          astmDesignation: astmDesignation.trim(),
          openingMm: Number(openingMm),
        },
        include: { equipment: true },
      });
      return sieve;
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Sieve",
      entityId: result.id,
      previousValue: null,
      newValue: result,
    });

    return res.status(201).json({ message: "Tamiz creado", data: result });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/sieves/:id
// Edita astmDesignation / openingMm (Sieve) y/o status (Equipment).
// ----------------------------------------------------
export async function updateSieve(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const { astmDesignation, openingMm, status, reason } = req.body as {
      astmDesignation?: string;
      openingMm?: number;
      status?: string;
      reason?: string;
    };

    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE." });
    }
    if (openingMm !== undefined && (!Number.isFinite(Number(openingMm)) || Number(openingMm) <= 0)) {
      return res.status(400).json({ message: "openingMm debe ser numérico > 0." });
    }

    const before = await prisma.sieve.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Tamiz no encontrado." });

    const sieveData: any = {};
    if (astmDesignation !== undefined) sieveData.astmDesignation = astmDesignation.trim();
    if (openingMm !== undefined) sieveData.openingMm = Number(openingMm);

    const updated = await prisma.$transaction(async (tx) => {
      if (status !== undefined) {
        await tx.equipment.update({ where: { id: before.equipmentId }, data: { status } });
      }
      return tx.sieve.update({
        where: { id },
        data: sieveData,
        include: { equipment: true },
      });
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Sieve",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    return res.json({ message: "Tamiz actualizado", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Tamiz no encontrado." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sieves/:id/verify
// Verificación interna periódica. Periodicidad: 6 meses (Felipe).
// AuditAction.VERIFY. Los tamices NO tienen calibración externa.
// ----------------------------------------------------
export async function verifySieve(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido." });
    }

    const { verifiedAt, reason } = req.body as { verifiedAt?: string; reason?: string };

    const before = await prisma.sieve.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Tamiz no encontrado." });

    const lastVerificationAt = verifiedAt ? new Date(verifiedAt) : new Date();
    const verificationDueAt = addMonths(lastVerificationAt, 6);

    const updated = await prisma.sieve.update({
      where: { id },
      data: { lastVerificationAt, verificationDueAt },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "Sieve",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Verificación interna periódica (6 meses)",
    });

    return res.json({ message: "Verificación registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") return res.status(404).json({ message: "Tamiz no encontrado." });
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
