// src/scripts/createAdmin.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../prismaClient";

async function main() {
  // contraseña del admin
  const plainPassword = "admin123";
  const hashed = await bcrypt.hash(plainPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      password: hashed,
      role: "ADMIN",
      name: "Admin Sistema",
    },
    create: {
      name: "Admin Sistema",
      email: "admin@example.com",
      password: hashed,
      role: "ADMIN",
    },
  });

  console.log("Admin listo:");
  console.log({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    password: plainPassword, // se muestra solo para pruebas
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
