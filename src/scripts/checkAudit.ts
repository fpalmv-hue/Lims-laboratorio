// src/scripts/checkAudit.ts
// Uso: npx ts-node src/scripts/checkAudit.ts <entityType> <entityId>
import prisma from "../prismaClient";

async function main() {
  const entityType = process.argv[2];
  const entityId = process.argv[3];

  if (!entityType || !entityId) {
    console.error("Uso: npx ts-node src/scripts/checkAudit.ts <entityType> <entityId>");
    process.exit(1);
  }

  const logs = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, role: true } } },
  });

  for (const log of logs) {
    const prevApproved = (log.previousValue as any)?.isApproved;
    const newApproved = (log.newValue as any)?.isApproved;
    console.log(
      `[${log.createdAt.toISOString()}] ${log.action} por ${log.user.name} (${log.user.role}) -- reason: ${log.reason ?? "(sin reason)"} -- isApproved: ${prevApproved} -> ${newApproved}`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
