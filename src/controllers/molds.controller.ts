import { Request, Response } from "express";
import { PrismaClient, MoldStatus } from "../generated/prisma";

const prisma = new PrismaClient();

export async function listMolds(req: Request, res: Response) {
  try {
    const onlyActive = String(req.query.active ?? "true") === "true";

    const molds = await prisma.mold.findMany({
      where: onlyActive ? { status: MoldStatus.ACTIVE } : undefined,
      orderBy: { code: "asc" },
    });

    return res.status(200).json({ message: "OK", data: molds });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Error interno", error: String(err?.message ?? err) });
  }
}
