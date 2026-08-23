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
import { requireAuth } from "./middlewares/auth";
import moldsRoutes from "./routes/molds.routes";
import proctorRoutes from "./routes/proctor.routes";
import cbrRoutes from "./routes/cbr.routes";
import pycnometerRoutes from "./routes/pycnometer.routes";
import particleDensityRoutes from "./routes/particleDensity.routes";
import moistureContentRoutes from "./routes/moistureContent.routes";
import sandConeRoutes from "./routes/sandCone.routes";
import sandConeTestRoutes from "./routes/sandConeTest.routes";
import gravelDensityRoutes from "./routes/gravelDensity.routes";
import documentRoutes from "./routes/document.routes";
import equipmentRoutes from "./routes/equipment.routes";
import sievesRoutes from "./routes/sieves.routes";
import aggregateGranulometryRoutes from "./routes/aggregateGranulometry.routes";
import losAngelesMachineRoutes from "./routes/losAngelesMachine.routes";
import losAngelesAbrasionRoutes from "./routes/losAngelesAbrasion.routes";
import clienteRoutes from "./routes/cliente.routes";
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
// Atterberg NO tiene router propio: vive dentro de samples.routes.ts
// (GET/PUT/approve bajo /api/samples/:sampleId/atterberg). Existio un
// atterbergRoutes.ts separado, montado aqui mismo, cuyas rutas GET/PUT
// quedaban shadowed por samples.routes.ts pero cuyo POST si era alcanzable
// (via createAtterberg) -- una via de creacion redundante y no intencional.
// Eliminado el 02-ago-2026 para dejar un unico camino de escritura.
app.use("/api/molds", moldsRoutes);
app.use("/api/proctors", proctorRoutes);
app.use("/api/cbrs", cbrRoutes);
app.use("/api/pycnometers", pycnometerRoutes);
app.use("/api/particle-densities", particleDensityRoutes);
app.use("/api/moisture-contents", moistureContentRoutes);
app.use("/api/sand-cones", sandConeRoutes);
app.use("/api/sand-cone-tests", sandConeTestRoutes);
app.use("/api/gravel-densities", gravelDensityRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/sieves", sievesRoutes);
app.use("/api/aggregate-granulometries", aggregateGranulometryRoutes);
app.use("/api/los-angeles-machines", losAngelesMachineRoutes);
app.use("/api/los-angeles-abrasions", losAngelesAbrasionRoutes);
app.use("/api/clientes", clienteRoutes);

// Inicio de servidor
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
