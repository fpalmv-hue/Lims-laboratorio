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
 
// FIX (auditoría 24-jul-2026): CORS estaba abierto a cualquier origen
// (app.use(cors()) sin opciones) desde el commit inicial del proyecto —
// cualquier sitio web podía hacer requests autenticados al backend desde
// el navegador del usuario. CORS_ORIGIN es una lista separada por comas de
// orígenes permitidos (ej: "https://labsoil.vercel.app,http://localhost:5173").
// Si no está definida, se permite solo localhost (desarrollo) y se avisa por
// consola — así el servidor sigue levantando en local sin configurar nada,
// pero en producción hay que setear la variable explícitamente.
const DEFAULT_DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];
 
export const CORS_ORIGINS: string[] = (() => {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === "") {
    console.warn(
      `⚠️  CORS_ORIGIN no está definida. Usando orígenes de desarrollo por ` +
        `defecto (${DEFAULT_DEV_ORIGINS.join(", ")}). Configúrala en producción.`
    );
    return DEFAULT_DEV_ORIGINS;
  }
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
})();
