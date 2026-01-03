import { PrismaClient, MoldStatus } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const molds = [
    {
      code: "MOLD-4IN-01",
      description: 'Molde Proctor 4" (101.6 mm) + collar',
      volumeCm3: 944.0,
      tareMassG: 1819,
      collarMassG: 0,
      status: MoldStatus.ACTIVE,
    },
    {
      code: "MOLD-6IN-01",
      description: 'Molde Proctor 6" (152.4 mm) + collar',
      volumeCm3: 2117.0,
      tareMassG: 3048,
      collarMassG: 0,
      status: MoldStatus.ACTIVE,
    },
  ] as const;

  for (const m of molds) {
    await prisma.mold.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        description: m.description,
        volumeCm3: m.volumeCm3,
        tareMassG: m.tareMassG,
        collarMassG: m.collarMassG,
        status: m.status,
      },
      update: {
        description: m.description,
        volumeCm3: m.volumeCm3,
        tareMassG: m.tareMassG,
        collarMassG: m.collarMassG,
        status: m.status,
      },
    });
  }

  // OPCIONAL: si quieres eliminar los viejos "M-4IN-01 / M-6IN-01"
  await prisma.mold.deleteMany({
    where: { code: { in: ["M-4IN-01", "M-6IN-01"] } },
  });

  console.log("✅ Seed de moldes OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
