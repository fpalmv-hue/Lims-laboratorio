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
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta pública de salud (fuera de /api a propósito: es una convención
// estándar que los health checks de infraestructura vivan en la raíz,
// no dentro del namespace de la API de negocio).
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "LIMS backend running",
  });
});

// Rutas públicas (no requieren token)
// ESTANDARIZACIÓN (25-jul-2026): todo el namespace de negocio vive bajo
// /api/* de forma consistente. Antes /auth, /users, /orders, /samples,
// /tests, /test-results y /granulometries no llevaban el prefijo mientras
// /api/molds, /api/proctors y atterberg sí -- esto generaba rutas reales
// distintas a las que un desarrollador esperaria por convencion.
// Cualquier modulo nuevo (nuevos ensayos, etc.) debe montarse bajo /api/*.
app.use("/api/auth", authRoutes); // /api/auth/login

// A partir de aqui TODO requiere estar autenticado.
// IMPORTANTE: en Express, un middleware solo protege las rutas montadas
// DESPUES de el. Todo lo que necesite requireAuth debe ir despues de esta
// linea, sin excepcion.
app.use(requireAuth);

// RUTAS PROTEGIDAS -- todas bajo /api
app.use("/api", homeRoutes); // GET /api
app.use("/api/users", usersRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/samples", samplesRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/test-results", testResultsRoutes);
app.use("/api/granulometries", granulometryRoutes);
app.use("/api", atterbergRoutes); // /api/samples/:sampleId/atterberg
app.use("/api/molds", moldsRoutes);
app.use("/api/proctors", proctorRoutes);

// Inicio de servidor
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
