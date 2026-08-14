// src/controllers/sandCone.controller.ts
//
// Catálogo de conos de arena como instrumento trazable.
// Refactorizado en Phase 1 Equipment (14-ago-2026):
// - code/status viven en Equipment padre (1:1).
// - Crear SandCone = crear Equipment + SandCone en transacción.
// - calibrate-deposit: suma depositVerificationDueAt (+6 meses).
// - calibrate-sand: suma sandDensityVerificationDueAt (+3 meses).
// - calibrate-funnel: sin verificationDueAt (periodicidad pendiente).
//
// MC Vol.8 §8.102.9: TRES calibraciones independientes con datos de
// forma distinta (deposito, densidad de arena, embudo) -- tres endpoints
// separados porque cada shape de body es incompatible con los otros.
import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";
import {
  computeDepositVolume,
  computeSandDensityCalibration,
  computeFunnelCalibration,
} from "../utils/sandConeCalc";

/** Agrega N meses calendario a una fecha. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Rangos esperados de hardware por tipo de aparato (informativo, §8.102.9
// tabla de equipos). No son tolerancias numericas de ensayo -- generan
// solo un warning en el response, nunca bloquean con 400.
const APPARATUS_SPECS: Record<
  string,
  { depositDiameterMm: number; balanceResolutionG: number; depositVolumeRangeCm3: [number, number] }
> = {
  CONVENTIONAL: { depositDiameterMm: 165, balanceResolutionG: 1, depositVolumeRangeCm3: [3000, 3500] },
  MACRO: { depositDiameterMm: 300, balanceResolutionG: 10, depositVolumeRangeCm3: [18000, 24000] },
};

function apparatusCoherenceWarning(sandCone: {
  apparatusType: string;
  depositDiameterMm?: number | null;
  balanceResolutionG?: number | null;
  depositVolumeCm3?: number | null;
}): string | undefined {
  const spec = APPARATUS_SPECS[sandCone.apparatusType];
  if (!spec) return undefined;

  const issues: string[] = [];

  if (
    sandCone.depositDiameterMm !== null &&
    sandCone.depositDiameterMm !== undefined &&
    Math.abs(sandCone.depositDiameterMm - spec.depositDiameterMm) > 15
  ) {
    issues.push(
      `depositDiameterMm (${sandCone.depositDiameterMm}) se aleja del esperado para ${sandCone.apparatusType} (~${spec.depositDiameterMm}mm)`
    );
  }
  if (
    sandCone.balanceResolutionG !== null &&
    sandCone.balanceResolutionG !== undefined &&
    sandCone.balanceResolutionG !== spec.balanceResolutionG
  ) {
    issues.push(
      `balanceResolutionG (${sandCone.balanceResolutionG}) distinta a la recomendada para ${sandCone.apparatusType} (${spec.balanceResolutionG}g)`
    );
  }
  if (sandCone.depositVolumeCm3 !== null && sandCone.depositVolumeCm3 !== undefined) {
    const [min, max] = spec.depositVolumeRangeCm3;
    if (sandCone.depositVolumeCm3 < min || sandCone.depositVolumeCm3 > max) {
      issues.push(
        `depositVolumeCm3 (${sandCone.depositVolumeCm3}) fuera del rango esperado para ${sandCone.apparatusType} (${min}-${max} cm³)`
      );
    }
  }

  if (issues.length === 0) return undefined;
  return `Coherencia con apparatusType (${sandCone.apparatusType}): ${issues.join("; ")}.`;
}

// ----------------------------------------------------
// GET /api/sand-cones?active=true
// ----------------------------------------------------
export async function listSandCones(req: AuthRequest, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const sandCones = await prisma.sandCone.findMany({
      include: { equipment: true },
      where: onlyActive ? { equipment: { status: "ACTIVE" } } : undefined,
      orderBy: { equipment: { code: "asc" } },
    });

    return res.status(200).json({ message: "OK", data: sandCones });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// GET /api/sand-cones/:id
// ----------------------------------------------------
export async function getSandConeById(req: AuthRequest, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const sandCone = await prisma.sandCone.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!sandCone) return res.status(404).json({ message: "Cono de arena no encontrado" });

    return res.status(200).json({ message: "OK", data: sandCone });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones
// Crea Equipment + SandCone en transacción atómica.
// Body: { code, description?, apparatusType, depositDiameterMm?,
//         balanceResolutionG?, status? }
// ----------------------------------------------------
export async function createSandCone(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { code, description, apparatusType, depositDiameterMm, balanceResolutionG, status } = req.body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "code es obligatorio" });
    }
    if (apparatusType !== "CONVENTIONAL" && apparatusType !== "MACRO") {
      return res.status(400).json({ message: "apparatusType es obligatorio: CONVENTIONAL o MACRO." });
    }
    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE" });
    }

    const existingEquipment = await prisma.equipment.findUnique({ where: { code: code.trim() } });
    if (existingEquipment) {
      return res.status(409).json({ message: "Ya existe un equipo con ese código." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const equipment = await tx.equipment.create({
        data: {
          code: code.trim(),
          type: "SAND_CONE",
          category: "NORMATIVE",
          status: status ?? "ACTIVE",
          description: description ?? null,
        },
      });
      const sandCone = await tx.sandCone.create({
        data: {
          equipmentId: equipment.id,
          description: description ?? null,
          apparatusType,
          depositDiameterMm: depositDiameterMm ?? null,
          balanceResolutionG: balanceResolutionG ?? null,
        },
        include: { equipment: true },
      });
      return sandCone;
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "SandCone",
      entityId: result.id,
      previousValue: null,
      newValue: result,
    });

    const warning = apparatusCoherenceWarning(result);

    return res
      .status(201)
      .json({ message: "Cono de arena creado", data: result, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/sand-cones/:id
// status → Equipment. Otros campos → SandCone.
// ----------------------------------------------------
export async function updateSandCone(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { description, apparatusType, depositDiameterMm, balanceResolutionG, status, reason } = req.body;

    if (apparatusType !== undefined && apparatusType !== "CONVENTIONAL" && apparatusType !== "MACRO") {
      return res.status(400).json({ message: "apparatusType debe ser CONVENTIONAL o MACRO." });
    }
    if (status !== undefined && status !== "ACTIVE" && status !== "OUT_OF_SERVICE") {
      return res.status(400).json({ message: "status debe ser ACTIVE o OUT_OF_SERVICE" });
    }

    const before = await prisma.sandCone.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Cono de arena no encontrado" });

    const coneData: any = {};
    if (description !== undefined) coneData.description = description;
    if (apparatusType !== undefined) coneData.apparatusType = apparatusType;
    if (depositDiameterMm !== undefined) {
      coneData.depositDiameterMm = depositDiameterMm === null ? null : Number(depositDiameterMm);
    }
    if (balanceResolutionG !== undefined) {
      coneData.balanceResolutionG = balanceResolutionG === null ? null : Number(balanceResolutionG);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (status !== undefined) {
        await tx.equipment.update({
          where: { id: before.equipmentId },
          data: { status },
        });
      }
      return tx.sandCone.update({
        where: { id },
        data: coneData,
        include: { equipment: true },
      });
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "SandCone",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason,
    });

    const warning = apparatusCoherenceWarning(updated);

    return res
      .status(200)
      .json({ message: "Cono de arena actualizado", data: updated, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Cono de arena no encontrado" });
    }
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones/:id/calibrate-deposit
// Calibracion 1: Vm = mw / ρw(tempC). Verificacion interna 6 meses.
// ----------------------------------------------------
export async function calibrateSandConeDeposit(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { massWaterG, waterTempC, calibratedAt, reason } = req.body;

    if (!Number.isFinite(Number(massWaterG))) {
      return res.status(400).json({ message: "massWaterG (mw) es obligatorio y debe ser numérico" });
    }
    if (!Number.isFinite(Number(waterTempC))) {
      return res.status(400).json({ message: "waterTempC es obligatorio y debe ser numérico" });
    }

    const before = await prisma.sandCone.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Cono de arena no encontrado" });

    const { volumeCm3, note } = computeDepositVolume({
      massWaterG: Number(massWaterG),
      waterTempC: Number(waterTempC),
    });

    if (volumeCm3 === null) {
      return res.status(400).json({ message: note });
    }

    const depositCalibratedAt = calibratedAt ? new Date(calibratedAt) : new Date();
    // Verificacion interna deposito/cono: periodicidad 6 meses (Felipe).
    const depositVerificationDueAt = addMonths(depositCalibratedAt, 6);

    const updated = await prisma.sandCone.update({
      where: { id },
      data: {
        depositMassWaterG: Number(massWaterG),
        depositWaterTempC: Number(waterTempC),
        depositVolumeCm3: volumeCm3,
        depositCalibratedAt,
        depositVerificationDueAt,
      },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "SandCone",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Calibracion de deposito (Vm) — verificacion interna 6 meses",
    });

    const warning = apparatusCoherenceWarning(updated);

    return res.status(200).json({
      message: "Calibración de depósito (Vm) registrada",
      data: updated,
      ...(warning ? { warning } : {}),
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones/:id/calibrate-sand
// Calibracion 2: ρA. Tolerancia bloqueante: variacion <= 1.5%.
// Verificacion interna 3 meses (arena normalizada, confirmado Felipe).
// ----------------------------------------------------
export async function calibrateSandConeSand(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { maValuesG, calibratedAt, reason } = req.body;

    if (
      !Array.isArray(maValuesG) ||
      maValuesG.length !== 5 ||
      maValuesG.some((v: any) => !Number.isFinite(Number(v)))
    ) {
      return res
        .status(400)
        .json({ message: "maValuesG es obligatorio: un arreglo de exactamente 5 masas numéricas (g)." });
    }

    const before = await prisma.sandCone.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Cono de arena no encontrado" });

    if (before.depositVolumeCm3 === null || before.depositVolumeCm3 === undefined) {
      return res
        .status(400)
        .json({ message: "El depósito debe calibrarse primero (Vm) -- ver POST /:id/calibrate-deposit." });
    }

    const calc = computeSandDensityCalibration({
      depositVolumeCm3: Number(before.depositVolumeCm3),
      maValuesG: maValuesG.map(Number),
    });

    if (calc.error) {
      return res.status(400).json({
        message: calc.error,
        data: { variationPercent: calc.variationPercent },
      });
    }

    const sandDensityCalibratedAt = calibratedAt ? new Date(calibratedAt) : new Date();
    // Verificacion interna arena normalizada: periodicidad 3 meses (Felipe).
    const sandDensityVerificationDueAt = addMonths(sandDensityCalibratedAt, 3);

    const updated = await prisma.sandCone.update({
      where: { id },
      data: {
        sandDensityRawJson: calc.raw as any,
        sandDensityGcm3: calc.sandDensityGcm3,
        sandDensityVariationPercent: calc.variationPercent,
        sandDensityCalibratedAt,
        sandDensityVerificationDueAt,
      },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "VERIFY",
      entityType: "SandCone",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Calibracion de densidad de arena (ρA) — verificacion interna 3 meses",
    });

    return res
      .status(200)
      .json({ message: "Calibración de densidad de arena (ρA) registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones/:id/calibrate-funnel
// Calibracion 3: mC. 3 determinaciones. Tolerancia <= 1.0%.
// Periodicidad AUN NO DEFINIDA -- no se calcula verificationDueAt.
// ----------------------------------------------------
export async function calibrateSandConeFunnel(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { determinations, calibratedAt, reason } = req.body;

    if (
      !Array.isArray(determinations) ||
      determinations.length !== 3 ||
      determinations.some(
        (d: any) => !Number.isFinite(Number(d?.massInitialG)) || !Number.isFinite(Number(d?.massFinalG))
      )
    ) {
      return res.status(400).json({
        message:
          "determinations es obligatorio: un arreglo de exactamente 3 objetos { massInitialG, massFinalG }.",
      });
    }

    const before = await prisma.sandCone.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!before) return res.status(404).json({ message: "Cono de arena no encontrado" });

    const calc = computeFunnelCalibration({
      determinations: determinations.map((d: any) => ({
        massInitialG: Number(d.massInitialG),
        massFinalG: Number(d.massFinalG),
      })),
    });

    if (calc.error) {
      return res.status(400).json({
        message: calc.error,
        data: { variationPercent: calc.variationPercent },
      });
    }

    const updated = await prisma.sandCone.update({
      where: { id },
      data: {
        funnelRawJson: calc.raw as any,
        funnelMassG: calc.funnelMassG,
        funnelVariationPercent: calc.variationPercent,
        funnelCalibratedAt: calibratedAt ? new Date(calibratedAt) : new Date(),
        // verificationDueAt NO calculado: periodicidad del embudo aun no
        // definida por Felipe. Ver CLAUDE.md seccion 4.
      },
      include: { equipment: true },
    });

    await registerAudit({
      userId,
      action: "CALIBRATE",
      entityType: "SandCone",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Calibracion de masa de arena del cono/embudo (mC)",
    });

    return res
      .status(200)
      .json({ message: "Calibración de embudo (mC) registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
