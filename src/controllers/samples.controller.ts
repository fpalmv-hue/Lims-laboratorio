// src/controllers/samples.controller.ts
import { Request, Response } from "express";
import prisma from "../prismaClient";

// -----------------------------------------------------------------------------
// Crear muestra
// POST /samples
// -----------------------------------------------------------------------------
export const createSample = async (req: Request, res: Response) => {
  try {
    const { code, project, location, materialType, receivedBy, status, notes } =
      req.body;

    if (!code || !project || !location || !materialType || !receivedBy) {
      return res.status(400).json({
        message:
          "code, project, location, materialType y receivedBy son obligatorios",
      });
    }

    // receivedAt: ahora mismo
    const receivedAt = new Date();

    // Evitar códigos duplicados
    const existing = await prisma.sample.findUnique({
      where: { code },
    });

    if (existing) {
      return res.status(409).json({
        message: "Ya existe una muestra con ese código.",
      });
    }

    const sample = await prisma.sample.create({
      data: {
        code,
        project,
        location,
        materialType,
        receivedAt,
        receivedBy,
        status: status ?? "PENDING",
        notes: notes ?? "",
      },
    });

    return res.status(201).json({
      message: "Muestra registrada",
      data: sample,
    });
  } catch (error) {
    console.error("Error en createSample:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// -----------------------------------------------------------------------------
// Listar muestras con filtros + paginación
// GET /samples?status=&project=&code=&page=&pageSize=
// -----------------------------------------------------------------------------
export const listSamples = async (req: Request, res: Response) => {
  try {
    const { status, project, code, page = "1", pageSize = "20" } = req.query;

    const where: any = {};

    if (status) {
      where.status = String(status);
    }

    if (project) {
      where.project = {
        contains: String(project),
        mode: "insensitive",
      };
    }

    if (code) {
      where.code = {
        contains: String(code),
        mode: "insensitive",
      };
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageSizeNumber = Math.max(Number(pageSize) || 20, 1);

    const [total, samples] = await Promise.all([
      prisma.sample.count({ where }),
      prisma.sample.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (pageNumber - 1) * pageSizeNumber,
        take: pageSizeNumber,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSizeNumber);

    return res.json({
      message: "Samples retrieved successfully",
      data: samples,
      meta: {
        page: pageNumber,
        pageSize: pageSizeNumber,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error en listSamples:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// -----------------------------------------------------------------------------
// Obtener una muestra por id
// GET /samples/:id
// -----------------------------------------------------------------------------
export const getSampleById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res
        .status(400)
        .json({ message: "El ID de la muestra debe ser numérico" });
    }

    const sample = await prisma.sample.findUnique({
      where: { id },
    });

    if (!sample) {
      return res.status(404).json({ message: "Muestra no encontrada" });
    }

    return res.json({
      message: "Muestra recuperada correctamente",
      data: sample,
    });
  } catch (error) {
    console.error("Error en getSampleById:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// -----------------------------------------------------------------------------
// Obtener muestra + todos sus ensayos
// GET /samples/:id/full
// -----------------------------------------------------------------------------
export const getSampleWithTests = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res
        .status(400)
        .json({ message: "El ID de la muestra debe ser numérico" });
    }

    const sample = await prisma.sample.findUnique({
      where: { id },
      include: {
        tests: true, // <-- relación Sample -> Test[]
      },
    });

    if (!sample) {
      return res.status(404).json({ message: "Muestra no encontrada" });
    }

    return res.json({
      message: "Muestra con ensayos recuperada correctamente",
      data: sample,
    });
  } catch (error) {
    console.error("Error en getSampleWithTests:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// -----------------------------------------------------------------------------
// Actualizar muestra
// PUT /samples/:id
// -----------------------------------------------------------------------------
export const updateSample = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res
        .status(400)
        .json({ message: "El ID de la muestra debe ser numérico" });
    }

    const {
      project,
      location,
      materialType,
      receivedAt,
      receivedBy,
      status,
      notes,
      assignedToId,
    } = req.body;

    const data: any = {};

    if (project !== undefined) data.project = project;
    if (location !== undefined) data.location = location;
    if (materialType !== undefined) data.materialType = materialType;
    if (receivedAt !== undefined) data.receivedAt = receivedAt;
    if (receivedBy !== undefined) data.receivedBy = receivedBy;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;
    if (assignedToId !== undefined) data.assignedToId = assignedToId;

    const updated = await prisma.sample.update({
      where: { id },
      data,
    });

    return res.json({
      message: "Muestra actualizada",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error en updateSample:", error);

    if (error.code === "P2025") {
      // Prisma: record not found
      return res.status(404).json({ message: "Muestra no encontrada" });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// -----------------------------------------------------------------------------
// Eliminar muestra
// DELETE /samples/:id
// -----------------------------------------------------------------------------
export const deleteSample = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res
        .status(400)
        .json({ message: "El ID de la muestra debe ser numérico" });
    }

    await prisma.sample.delete({
      where: { id },
    });

    return res.json({ message: "Muestra eliminada correctamente" });
  } catch (error: any) {
    console.error("Error en deleteSample:", error);

    if (error.code === "P2025") {
      return res.status(404).json({ message: "Muestra no encontrada" });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
