// src/config/env.ts
//
// Centraliza el acceso a variables de entorno sensibles. Antes, JWT_SECRET
// tenía un fallback hardcodeado ("DEV_SUPER_SECRET_KEY") en dos archivos
// distintos (middlewares/auth.ts y controllers/auth.controller.ts). Si en
// producción faltaba la variable de entorno, el servidor arrancaba igual
// usando ese secreto público y conocido — cualquiera podía forjar tokens
// válidos. Ahora: si falta, el servidor NO arranca.

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Variable de entorno requerida "${name}" no está definida. ` +
        `Configúrala en tu .env (ver .env.example) antes de levantar el servidor.`
    );
  }
  return value;
}

// Se evalúa una sola vez, al importar este módulo (o sea, al arrancar el
// servidor) — si falta, el proceso falla inmediatamente con un mensaje claro
// en vez de exponer un endpoint de auth inseguro en silencio.
export const JWT_SECRET = getRequiredEnv("JWT_SECRET");
