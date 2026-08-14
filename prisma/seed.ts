// prisma/seed.ts
// Seed de datos mínimos para desarrollo.
// Tras Phase 1 Equipment (14-ago-2026): Mold ya no tiene code/status
// propios -- esos campos viven en Equipment. Upsert de Mold = upsert de
// Equipment por code + link a Mold existente o creación de ambos.
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const MOLDS = [
  {
    code: "MOLD-4IN-01",
    description: 'Molde Proctor 4" (101.6 mm) + collar',
    volumeCm3: 944.0,
    tareMassG: 1819,
    collarMassG: 0,
  },
  {
    code: "MOLD-6IN-01",
    description: 'Molde Proctor 6" (152.4 mm) + collar',
    volumeCm3: 2117.0,
    tareMassG: 3048,
    collarMassG: 0,
  },
] as const;

async function main() {
  for (const m of MOLDS) {
    // Upsert Equipment (la unicidad real está en Equipment.code)
    const equipment = await prisma.equipment.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        type: "MOLD",
        category: "NORMATIVE",
        status: "ACTIVE",
        description: m.description,
      },
      update: {
        description: m.description,
        status: "ACTIVE",
      },
    });

    // Upsert Mold vinculado al Equipment
    await prisma.mold.upsert({
      where: { equipmentId: equipment.id },
      create: {
        equipmentId: equipment.id,
        description: m.description,
        volumeCm3: m.volumeCm3,
        tareMassG: m.tareMassG,
        collarMassG: m.collarMassG,
      },
      update: {
        description: m.description,
        volumeCm3: m.volumeCm3,
        tareMassG: m.tareMassG,
        collarMassG: m.collarMassG,
      },
    });
  }

  console.log("Seed de moldes OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
