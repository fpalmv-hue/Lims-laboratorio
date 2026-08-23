// src/utils/auditLog.ts
//
// Helper reutilizable para registrar trazabilidad en AuditLog (ISO 17025).
// Cualquier controller que cree, edite o apruebe un registro debe llamar
// a esta función. No usar prisma.auditLog.create directamente en los
// controllers: centralizar acá evita inconsistencias en el formato.
//
// USO TÍPICO en un controller (ejemplo con un update):
//
//   const before = await prisma.testResult.findUnique({ where: { id } });
//   const updated = await prisma.testResult.update({ where: { id }, data });
//   await registerAudit({
//     userId: req.user.id,        // viene del JWT decodificado por requireAuth
//     action: "UPDATE",
//     entityType: "TestResult",
//     entityId: id,
//     previousValue: before,
//     newValue: updated,
//     reason: req.body.reason,    // obligatorio si el registro ya estaba aprobado
//   });
//
import prisma from "../prismaClient";
import { AuditAction } from "../generated/prisma";

interface RegisterAuditParams {
  userId: number;
  action: AuditAction;
  entityType: string; // "TestResult" | "Mold" | "User" | "Document" | "Cliente" | etc.
  // number para entidades con id autoincremental (la mayoría), string
  // para entidades con id cuid (ej. Cliente, Fase 7). Se persiste como
  // texto en AuditLog.entityId en ambos casos.
  entityId: number | string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

export async function registerAudit(params: RegisterAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: String(params.entityId),
        previousValue: params.previousValue as any,
        newValue: params.newValue as any,
        reason: params.reason,
      },
    });
  } catch (error) {
    // IMPORTANTE: un fallo al escribir el AuditLog NUNCA debe tumbar la
    // operación principal (crear/editar el dato real). Se loguea el error
    // para revisión, pero la respuesta al usuario sigue su curso normal.
    // Si en el futuro se requiere que sea estrictamente atómico (todo o
    // nada), esto debe envolverse en una transacción de Prisma junto con
    // la operación principal -- pendiente de decidir según criticidad.
    console.error("Error registrando AuditLog:", error);
  }
}
