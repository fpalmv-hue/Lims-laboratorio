// src/server.ts
import express from "express";
import cors from "cors";
 
import homeRoutes from "./routes/home.routes";
import ordersRoutes from "./routes/orders.routes";
import samplesRoutes from "./routes/samples.routes";
import usersRoutes from "./routes/users.routes";
import authRoutes from "./routes/auth.routes";
import testRoutes from "./routes/test.routes";
import testResultsRoutes from "./routes/testResults.routes";
import granulometryRoutes from "./routes/granulometry.routes";
import atterbergRoutes from "./routes/atterbergRoutes";
import { requireAuth } from "./middlewares/auth";
import moldsRoutes from "./routes/molds.routes";
import proctorRoutes from "./routes/proctor.routes";
import { CORS_ORIGINS } from "./config/env";
 
const app = express();
const PORT = process.env.PORT || 4000;
 
// Middlewares globales
// FIX (auditoría 24-jul-2026): antes app.use(cors()) sin opciones aceptaba
// requests de CUALQUIER origen. Ahora solo se permiten los orígenes listados
// en CORS_ORIGIN (ver src/config/env.ts).
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
// ✅ Ruta pública de salud
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "LIMS backend running",
  });
});
 
// ✅ Rutas públicas (no requieren token)
app.use("/auth", authRoutes); // /auth/login, etc.
 
// ✅ A partir de aquí TODO requiere estar autenticado.
// IMPORTANTE: en Express, un middleware solo protege las rutas montadas
// DESPUÉS de él. Todo lo que necesite requireAuth debe ir después de esta
// línea, sin excepción.
app.use(requireAuth);
 
// ✅ RUTAS PROTEGIDAS
app.use("/", homeRoutes);
app.use("/users", usersRoutes);
app.use("/orders", ordersRoutes);
app.use("/samples", samplesRoutes);
app.use("/tests", testRoutes);
app.use("/test-results", testResultsRoutes);
app.use("/granulometries", granulometryRoutes);
app.use("/api", atterbergRoutes);
app.use("/api/molds", moldsRoutes);
app.use("/api/proctors", proctorRoutes);
 
// Inicio de servidor
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
 
export default app;