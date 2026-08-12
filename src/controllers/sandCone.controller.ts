// src/controllers/sandCone.controller.ts
//
// Catalogo de conos de arena como instrumento trazable, mismo patron que
// molds.controller.ts / pycnometer.controller.ts: create/update para
// datos generales, y calibracion como evento(s) formal(es) separado(s).
//
// MC Vol.8 §8.102.9 define TRES calibraciones independientes con datos
// de forma distinta (deposito, densidad de arena, embudo) -- se separan
// en tres endpoints en vez de forzarlas a un unico shape de body.
//
// Dos equipos (apparatusType CONVENTIONAL/MACRO) con rangos esperados de
// deposito/balanza distintos -- la coherencia se valida como warning
// informativo, no bloqueante (no es una tolerancia numerica normativa,
// es un dato de catalogo de hardware).
import { Response } from "express";
import prisma from "../prismaClient";
import { SandConeStatus } from "../generated/prisma";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";
import {
  computeDepositVolume,
  computeSandDensityCalibration,
  computeFunnelCalibration,
} from "../utils/sandConeCalc";

// Rangos esperados de hardware por tipo de aparato (informativo, §8.102.9
// tabla de equipos). No son tolerancias numericas de ensayo -- solo
// generan un warning en el response, nunca bloquean con 400.
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
      where: onlyActive ? { status: SandConeStatus.ACTIVE } : undefined,
      orderBy: { code: "asc" },
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

    const sandCone = await prisma.sandCone.findUnique({ where: { id } });
    if (!sandCone) return res.status(404).json({ message: "Cono de arena no encontrado" });

    return res.status(200).json({ message: "OK", data: sandCone });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones
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

    const existing = await prisma.sandCone.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un cono de arena con ese código." });
    }

    const sandCone = await prisma.sandCone.create({
      data: {
        code: code.trim(),
        description: description ?? null,
        apparatusType,
        depositDiameterMm: depositDiameterMm ?? null,
        balanceResolutionG: balanceResolutionG ?? null,
        status: status ?? SandConeStatus.ACTIVE,
      },
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "SandCone",
      entityId: sandCone.id,
      previousValue: null,
      newValue: sandCone,
    });

    const warning = apparatusCoherenceWarning(sandCone);

    return res
      .status(201)
      .json({ message: "Cono de arena creado", data: sandCone, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// PUT /api/sand-cones/:id
// Edición de datos generales (no calibración).
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

    const data: any = {};
    if (description !== undefined) data.description = description;
    if (apparatusType !== undefined) data.apparatusType = apparatusType;
    if (depositDiameterMm !== undefined) {
      data.depositDiameterMm = depositDiameterMm === null ? null : Number(depositDiameterMm);
    }
    if (balanceResolutionG !== undefined) {
      data.balanceResolutionG = balanceResolutionG === null ? null : Number(balanceResolutionG);
    }
    if (status !== undefined) data.status = status;

    const before = await prisma.sandCone.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Cono de arena no encontrado" });

    const updated = await prisma.sandCone.update({ where: { id }, data });

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
// Calibracion 1: Vm = mw / ρw(tempC) (tabla 8.102.9.A), aproximado a 1cm3
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

    const before = await prisma.sandCone.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Cono de arena no encontrado" });

    const { volumeCm3, note } = computeDepositVolume({
      massWaterG: Number(massWaterG),
      waterTempC: Number(waterTempC),
    });

    if (volumeCm3 === null) {
      return res.status(400).json({ message: note });
    }

    const updated = await prisma.sandCone.update({
      where: { id },
      data: {
        depositMassWaterG: Number(massWaterG),
        depositWaterTempC: Number(waterTempC),
        depositVolumeCm3: volumeCm3,
        depositCalibratedAt: calibratedAt ? new Date(calibratedAt) : new Date(),
      },
    });

    await registerAudit({
      userId,
      action: "CALIBRATE",
      entityType: "SandCone",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Calibracion de deposito (Vm)",
    });

    const warning = apparatusCoherenceWarning(updated);

    return res
      .status(200)
      .json({ message: "Calibración de depósito (Vm) registrada", data: updated, ...(warning ? { warning } : {}) });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones/:id/calibrate-sand
// Calibracion 2: ρA -- 5 determinaciones, se promedian TODAS. Tolerancia
// bloqueante: variacion entre las 5 <= 1.5% (§8.102.9).
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

    const before = await prisma.sandCone.findUnique({ where: { id } });
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

    const updated = await prisma.sandCone.update({
      where: { id },
      data: {
        sandDensityRawJson: calc.raw as any,
        sandDensityGcm3: calc.sandDensityGcm3,
        sandDensityVariationPercent: calc.variationPercent,
        sandDensityCalibratedAt: calibratedAt ? new Date(calibratedAt) : new Date(),
      },
    });

    await registerAudit({
      userId,
      action: "CALIBRATE",
      entityType: "SandCone",
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
      reason: reason ?? "Calibracion de densidad de arena (ρA)",
    });

    return res.status(200).json({ message: "Calibración de densidad de arena (ρA) registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}

// ----------------------------------------------------
// POST /api/sand-cones/:id/calibrate-funnel
// Calibracion 3: mC -- 3 determinaciones (mI/mF cada una), se promedian
// las 3. Tolerancia bloqueante: variacion entre las 3 <= 1.0% (§8.102.9).
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

    const before = await prisma.sandCone.findUnique({ where: { id } });
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
      },
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

    return res.status(200).json({ message: "Calibración de embudo (mC) registrada", data: updated });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
}
