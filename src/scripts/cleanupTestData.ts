// Script temporal de limpieza de datos de prueba para Fase 3.
// Borra ensayos y equipos creados durante la verificación end-to-end.
// No comitear este archivo — solo se usa durante las pruebas locales.
import prisma from "../prismaClient";

// Configurar acá qué borrar en cada corrida:
const GRAVEL_DENSITY_IDS: number[] = [];
const MOISTURE_CONTENT_IDS: number[] = [];
const ATTERBERG_IDS: number[] = [];
const PARTICLE_DENSITY_IDS: number[] = [4];
const SAMPLE_CODES: string[] = [];
const PYCNOMETER_CODES: string[] = ["TEST-PICN-001"];
const EQUIPMENT_CODES: string[] = ["TEST-BAL-004", "TEST-PAT-004"];

async function main() {
  // Borrar EquipmentUsage huérfanos de los ensayos de prueba ya borrados
  if (GRAVEL_DENSITY_IDS.length) {
    await prisma.equipmentUsage.deleteMany({ where: { entityType: "GRAVEL_DENSITY", entityId: { in: GRAVEL_DENSITY_IDS } } });
    const r = await prisma.gravelDensity.deleteMany({ where: { id: { in: GRAVEL_DENSITY_IDS } } });
    console.log(`GravelDensity borrados: ${r.count}`);
  }
  if (MOISTURE_CONTENT_IDS.length) {
    await prisma.equipmentUsage.deleteMany({ where: { entityType: "MOISTURE_CONTENT", entityId: { in: MOISTURE_CONTENT_IDS } } });
    const r = await prisma.moistureContent.deleteMany({ where: { id: { in: MOISTURE_CONTENT_IDS } } });
    console.log(`MoistureContent borrados: ${r.count}`);
  }
  if (ATTERBERG_IDS.length) {
    await prisma.equipmentUsage.deleteMany({ where: { entityType: "ATTERBERG", entityId: { in: ATTERBERG_IDS } } });
    const r = await prisma.atterberg.deleteMany({ where: { id: { in: ATTERBERG_IDS } } });
    console.log(`Atterberg borrados: ${r.count}`);
  }
  if (PARTICLE_DENSITY_IDS.length) {
    await prisma.equipmentUsage.deleteMany({ where: { entityType: "PARTICLE_DENSITY", entityId: { in: PARTICLE_DENSITY_IDS } } });
    const r = await prisma.particleDensity.deleteMany({ where: { id: { in: PARTICLE_DENSITY_IDS } } });
    console.log(`ParticleDensity borrados: ${r.count}`);
  }
  if (SAMPLE_CODES.length) {
    const r = await prisma.sample.deleteMany({ where: { code: { in: SAMPLE_CODES } } });
    console.log(`Muestras de prueba borradas: ${r.count}`);
  }
  if (PYCNOMETER_CODES.length) {
    for (const code of PYCNOMETER_CODES) {
      const eq = await prisma.equipment.findUnique({ where: { code }, include: { usages: true, pycnometer: true } });
      if (!eq) { console.log(`(omitido) Equipment ${code} no existe.`); continue; }
      if (eq.usages.length > 0) { console.log(`ABORTADO ${code}: tiene ${eq.usages.length} usages reales.`); continue; }
      if (eq.pycnometer) await prisma.pycnometer.delete({ where: { id: eq.pycnometer.id } });
      await prisma.equipment.delete({ where: { id: eq.id } });
      console.log(`Borrado picnómetro+equipo: ${code}`);
    }
  }

  for (const code of EQUIPMENT_CODES) {
    const eq = await prisma.equipment.findUnique({
      where: { code },
      include: { usages: true },
    });
    if (!eq) { console.log(`(omitido) ${code} no existe.`); continue; }
    if (eq.usages.length > 0) {
      console.log(`ABORTADO ${code}: tiene ${eq.usages.length} EquipmentUsage(s) reales.`);
      continue;
    }
    await prisma.equipment.delete({ where: { id: eq.id } });
    console.log(`Borrado: ${code} (id=${eq.id})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
