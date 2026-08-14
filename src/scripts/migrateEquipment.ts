// src/scripts/migrateEquipment.ts
//
// Script de VERIFICACION post-migración (Phase 1 Equipment).
// NO modifica datos -- solo lee Neon y confirma que:
//
//   1. Cada Mold tiene equipmentId poblado y su Equipment tiene type=MOLD.
//   2. Cada Pycnometer tiene equipmentId poblado y type=PYCNOMETER.
//   3. Cada SandCone tiene equipmentId poblado y type=SAND_CONE.
//   4. Ningun Mold/Pycnometer/SandCone quedo huerfano (equipmentId null).
//   5. No hay Equipment sin su tabla de detalle correspondiente
//      (Mold sin Mold, PYCNOMETER sin Pycnometer, etc.).
//
// Ejecutar DESPUES de correr la migracion SQL en Neon:
//   npx ts-node src/scripts/migrateEquipment.ts
//
// Aprobacion manual de Felipe antes de aplicar la migracion en Neon.
import prisma from "../prismaClient";

async function main() {
  console.log("=== Verificacion post-migracion Equipment (Phase 1) ===\n");

  let allOk = true;

  // ── 1. Molds ──────────────────────────────────────────────────
  const molds = await prisma.mold.findMany({
    include: { equipment: true },
  });
  console.log(`Molds en BD: ${molds.length}`);
  for (const m of molds) {
    const ok = m.equipment !== null && m.equipment.type === "MOLD";
    const icon = ok ? "✓" : "✗ ERROR";
    console.log(
      `  ${icon}  Mold id=${m.id} → Equipment id=${m.equipmentId} code="${m.equipment?.code}" type=${m.equipment?.type}`
    );
    if (!ok) allOk = false;
  }

  // ── 2. Pycnometers ────────────────────────────────────────────
  const pycs = await prisma.pycnometer.findMany({
    include: { equipment: true },
  });
  console.log(`\nPycnometers en BD: ${pycs.length}`);
  for (const p of pycs) {
    const ok = p.equipment !== null && p.equipment.type === "PYCNOMETER";
    const icon = ok ? "✓" : "✗ ERROR";
    console.log(
      `  ${icon}  Pycnometer id=${p.id} → Equipment id=${p.equipmentId} code="${p.equipment?.code}" type=${p.equipment?.type}`
    );
    if (!ok) allOk = false;
  }

  // ── 3. SandCones ──────────────────────────────────────────────
  const cones = await prisma.sandCone.findMany({
    include: { equipment: true },
  });
  console.log(`\nSandCones en BD: ${cones.length}`);
  for (const c of cones) {
    const ok = c.equipment !== null && c.equipment.type === "SAND_CONE";
    const icon = ok ? "✓" : "✗ ERROR";
    console.log(
      `  ${icon}  SandCone id=${c.id} → Equipment id=${c.equipmentId} code="${c.equipment?.code}" type=${c.equipment?.type}`
    );
    if (!ok) allOk = false;
  }

  // ── 4. Equipment NORMATIVE sin detalle (potencial inconsistencia) ─
  const normativeEquipments = await prisma.equipment.findMany({
    where: { category: "NORMATIVE" },
    include: { mold: true, pycnometer: true, sandCone: true },
  });
  console.log(`\nEquipment NORMATIVE en BD: ${normativeEquipments.length}`);
  for (const e of normativeEquipments) {
    const hasDetail =
      (e.type === "MOLD" && e.mold !== null) ||
      (e.type === "PYCNOMETER" && e.pycnometer !== null) ||
      (e.type === "SAND_CONE" && e.sandCone !== null);
    const icon = hasDetail ? "✓" : "✗ SIN DETALLE";
    console.log(`  ${icon}  Equipment id=${e.id} code="${e.code}" type=${e.type}`);
    if (!hasDetail) allOk = false;
  }

  // ── Resumen ───────────────────────────────────────────────────
  console.log("\n" + (allOk ? "=== OK: migración sin huérfanos ===" : "=== ERRORES DETECTADOS — revisar arriba ==="));
  if (!allOk) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
