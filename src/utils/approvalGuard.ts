// src/utils/approvalGuard.ts
//
// Helpers compartidos para la regla de negocio ISO 17025 sobre registros
// ya aprobados (TestResult, Proctor, Atterberg, Granulometry -- los 4
// modelos que tienen isApproved/approvedById/approvedAt).
//
// Regla completa:
//   1) Si el registro ya estaba aprobado (isApproved === true) y se
//      intenta editar, "reason" pasa a ser obligatorio en el body.
//   2) Si se edita un registro que ya estaba aprobado, la edición debe
//      revertir automáticamente isApproved a false (y limpiar
//      approvedById/approvedAt) -- vuelve a quedar pendiente de visado
//      por Jefatura/Calidad. El AuditLog de esa misma edición (UPDATE)
//      ya deja trazado el cambio previousValue.isApproved=true ->
//      newValue.isApproved=false, así que no hace falta un AuditLog
//      separado para el revert en la mayoría de los casos.
//
// USO TÍPICO en un controller/service, después de tener el registro
// "antes" de la edición:
//
//   const guardMsg = assertReasonIfApproved(before.isApproved, req.body.reason);
//   if (guardMsg) return res.status(400).json({ message: guardMsg });
//
//   const updated = await prisma.testResult.update({
//     where: { id },
//     data: {
//       ...dataToUpdate,
//       ...approvalResetIfNeeded(before.isApproved),
//     },
//   });
//
export function assertReasonIfApproved(
  wasApproved: boolean,
  reason: unknown
): string | null {
  if (!wasApproved) return null;

  if (typeof reason !== "string" || !reason.trim()) {
    return "reason es obligatorio: este registro ya estaba aprobado.";
  }

  return null;
}

export function approvalResetIfNeeded(wasApproved: boolean): {
  isApproved?: boolean;
  approvedById?: null;
  approvedAt?: null;
} {
  if (!wasApproved) return {};
  return { isApproved: false, approvedById: null, approvedAt: null };
}
