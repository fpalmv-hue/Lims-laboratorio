// src/controllers/document.controller.ts
//
// Control documental ISO 9001 (clausula 7.5): procedimientos,
// instructivos de trabajo, formatos y manual de calidad DEL PROPIO
// LABORATORIO -- no confundir con los resultados de ensayo (Atterberg,
// Granulometry, Proctor, TestResult), que son un modulo completamente
// distinto. Este modulo es una biblioteca de documentos internos que el
// personal consulta para saber COMO ejecutar un ensayo, no donde se
// cargan pesos ni datos de muestra.
//
// Ciclo de vida (confirmado con el usuario 02-ago-2026):
//   UNDER_REVIEW (recien creado, sin aprobar)
//     -> ACTIVE (aprobado, es la version vigente)
//       -> OBSOLETE (retirado, se conserva para trazabilidad ante
//          auditoria -- nunca se borra un documento obsoleto)
//
// Editar un documento ya ACTIVE exige reason (igual que los resultados
// de ensayo) Y un version nuevo explicito (no se auto-incrementa: el
// formato de version puede ser numerico o texto libre tipo "Rev. A").
// Esa edicion revierte automaticamente status a UNDER_REVIEW y crea un
// registro en DocumentRevision con el historial.

import { Response } from "express";
import prisma from "../prismaClient";
import { AuthRequest } from "../middlewares/auth";
import { registerAudit } from "../utils/auditLog";
import { assertReasonIfApproved, approvalResetIfNeeded } from "../utils/approvalGuard";

const VALID_CATEGORIES = [
  "PROCEDURE",
  "WORK_INSTRUCTION",
  "FORMAT",
  "QUALITY_MANUAL",
  "TECHNICAL_NORM",
  "INTERNAL_POLICY",
  "OTHER",
];

export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { code, title, category, description, fileUrl } = req.body as {
      code?: string;
      title?: string;
      category?: string;
      description?: string | null;
      fileUrl?: string | null;
    };

    if (!code || !String(code).trim()) {
      return res.status(400).json({ message: "code es obligatorio." });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "title es obligatorio." });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category invalido. Valores validos: ${VALID_CATEGORIES.join(", ")}.` });
    }

    const existing = await prisma.document.findUnique({ where: { code: String(code).trim() } });
    if (existing) {
      return res.status(409).json({ message: `Ya existe un documento con code "${code}".` });
    }

    const created = await prisma.document.create({
      data: {
        code: String(code).trim(),
        title: String(title).trim(),
        category: category as any,
        description: description ?? null,
        fileUrl: fileUrl ?? null,
        createdById: userId,
        // status y version usan sus defaults del schema:
        // UNDER_REVIEW / "1.0" / isApproved=false
      },
    });

    await registerAudit({
      userId,
      action: "CREATE",
      entityType: "Document",
      entityId: created.id,
      previousValue: null,
      newValue: created,
    });

    return res.status(201).json({ message: "OK", data: created });
  } catch (err: any) {
    console.error("❌ createDocument error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getDocumentById = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "id invalido." });

    const row = await prisma.document.findUnique({
      where: { id },
      include: { revisions: { orderBy: { updatedAt: "desc" } } },
    });

    if (!row) return res.status(404).json({ message: "Documento no encontrado." });

    return res.json({ message: "OK", data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getDocumentByCode = async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.params.code ?? "").trim();
    if (!code) return res.status(400).json({ message: "code invalido." });

    const row = await prisma.document.findUnique({
      where: { code },
      include: { revisions: { orderBy: { updatedAt: "desc" } } },
    });

    if (!row) return res.status(404).json({ message: "Documento no encontrado." });

    return res.json({ message: "OK", data: row });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const listDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { category, status } = req.query as { category?: string; status?: string };

    const where: any = {};
    if (category) where.category = category;
    if (status) where.status = status;

    const rows = await prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return res.json({ message: "OK", data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * PUT /documents/:id
 * Edita metadata de un documento. Si el documento ya estaba aprobado
 * (isApproved=true), exige reason Y un version nuevo (distinto al
 * actual), revierte automaticamente a UNDER_REVIEW (pendiente de
 * re-aprobacion), y crea un registro en DocumentRevision con el
 * historial del cambio. Si nunca fue aprobado (todavia UNDER_REVIEW,
 * primer borrador), se edita libremente sin estas exigencias.
 */
export const updateDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "id invalido." });

    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Documento no encontrado." });

    const { title, category, description, fileUrl, version, reason } = req.body as {
      title?: string;
      category?: string;
      description?: string | null;
      fileUrl?: string | null;
      version?: string;
      reason?: string;
    };

    // Regla ISO 9001: reason obligatorio si ya estaba aprobado (mismo
    // guard que usamos en TestResult/Atterberg/Granulometry/Proctor).
    const guardMsg = assertReasonIfApproved(existing.isApproved, reason);
    if (guardMsg) {
      return res.status(400).json({ message: guardMsg });
    }

    // Si ya estaba aprobado, exige ademas un version nuevo explicito
    // (no se auto-incrementa -- ver nota de diseño arriba).
    if (existing.isApproved) {
      if (!version || !String(version).trim()) {
        return res.status(400).json({
          message: "version es obligatorio al editar un documento ya aprobado (debe indicar la nueva version explicitamente).",
        });
      }
      if (String(version).trim() === existing.version) {
        return res.status(400).json({
          message: `El nuevo version ("${version}") debe ser distinto al actual ("${existing.version}").`,
        });
      }
    }

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category invalido. Valores validos: ${VALID_CATEGORIES.join(", ")}.` });
    }

    const wasApproved = existing.isApproved;

    const updated = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id },
        data: {
          title: title !== undefined ? String(title).trim() : undefined,
          category: category !== undefined ? (category as any) : undefined,
          description: description !== undefined ? description : undefined,
          fileUrl: fileUrl !== undefined ? fileUrl : undefined,
          version: wasApproved ? String(version).trim() : version !== undefined ? String(version).trim() : undefined,
          // si estaba aprobado, esta edicion lo revierte a UNDER_REVIEW
          // (approvalResetIfNeeded limpia isApproved/approvedById/approvedAt;
          // el status hay que revertirlo a mano porque es especifico de Document)
          ...approvalResetIfNeeded(existing.isApproved),
          status: wasApproved ? "UNDER_REVIEW" : undefined,
        },
      });

      // DocumentRevision solo se crea al editar un documento que YA
      // estaba aprobado -- no se registra cada ajuste de un borrador
      // (UNDER_REVIEW) que todavia no tuvo su primera aprobacion.
      if (wasApproved) {
        await tx.documentRevision.create({
          data: {
            documentId: id,
            version: doc.version,
            changes: reason ?? null,
            updatedById: userId,
          },
        });
      }

      return doc;
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Document",
      entityId: id,
      previousValue: existing,
      newValue: updated,
      reason,
    });

    return res.json({ message: "OK", data: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno al actualizar documento" });
  }
};

/**
 * POST /documents/:id/approve
 * UNDER_REVIEW -> ACTIVE. Requiere rol ADMIN, JEFE o CALIDAD.
 */
export const approveDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "id invalido." });

    const before = await prisma.document.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Documento no encontrado." });

    // FIX (verificacion runtime 02-ago-2026): el chequeo de OBSOLETE
    // quedaba inalcanzable porque isApproved sigue en true al pasar a
    // OBSOLETE (representa "fue aprobado alguna vez", no "es la version
    // vigente" -- ver obsoleteDocument). Se reordena para dar el mensaje
    // mas especifico primero.
    if (before.status === "OBSOLETE") {
      return res.status(409).json({ message: "No se puede aprobar un documento OBSOLETE. Cree una nueva version primero." });
    }
    if (before.isApproved) {
      return res.status(409).json({ message: "Este documento ya estaba aprobado." });
    }

    const updated = await prisma.document.update({
      where: { id },
      data: {
        isApproved: true,
        approvedById: userId,
        approvedAt: new Date(),
        status: "ACTIVE",
        effectiveDate: before.effectiveDate ?? new Date(),
      },
    });

    await registerAudit({
      userId,
      action: "APPROVE",
      entityType: "Document",
      entityId: id,
      previousValue: before,
      newValue: updated,
      reason: req.body?.reason,
    });

    return res.json({ message: "Documento aprobado", data: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno al aprobar documento" });
  }
};

/**
 * POST /documents/:id/obsolete
 * ACTIVE -> OBSOLETE. El documento se conserva (nunca se borra) para
 * trazabilidad ante auditoria ISO 9001 -- solo deja de ser la version
 * vigente. Requiere rol ADMIN, JEFE o CALIDAD.
 */
export const obsoleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "id invalido." });

    const before = await prisma.document.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: "Documento no encontrado." });

    if (before.status === "OBSOLETE") {
      return res.status(409).json({ message: "Este documento ya estaba OBSOLETE." });
    }
    if (before.status !== "ACTIVE") {
      return res.status(409).json({
        message: "Solo se puede marcar OBSOLETE un documento ACTIVE (aprobado y vigente).",
      });
    }

    const updated = await prisma.document.update({
      where: { id },
      data: {
        status: "OBSOLETE",
        obsoleteDate: new Date(),
      },
    });

    await registerAudit({
      userId,
      action: "UPDATE",
      entityType: "Document",
      entityId: id,
      previousValue: before,
      newValue: updated,
      reason: req.body?.reason,
    });

    return res.json({ message: "Documento marcado como OBSOLETE", data: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno al marcar documento obsoleto" });
  }
};
