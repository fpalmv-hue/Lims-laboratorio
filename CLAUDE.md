]633;E;sed -n '1,30p' CLAUDE.md;9047f330-64e2-4a79-86d4-981a91e72a8b]633;C# CLAUDE.md — LABSOIL

Contexto para cualquier instancia de Claude (u otra IA) que trabaje en este repositorio. Léelo completo antes de tocar código.

## Qué es este proyecto

LABSOIL es un LIMS (Laboratory Information Management System) para un laboratorio de mecánica de suelos en Chile, desarrollado por un Ingeniero en Construcción / Laboratorista Vial (no programador) como software de producción real -- NO es un proyecto academico ni de tesis. El laboratorio certifica bajo **MOP 8.102.1** (norma chilena de vialidad) y tiene requisitos funcionales reales de **ISO 17025 + ISO 9001** (acreditación INN Chile) — implementados vía trazabilidad de auditoría, control de calibración y flujo de aprobación, no como justificación para cambios de arquitectura. Prioridad estrategica confirmada (02-ago-2026): expandir la cantidad de tipos de ensayo soportados por el backend, no construir un frontend todavia -- eso queda deliberadamente pospuesto.

## Decisión de arquitectura FIJA (no reabrir)

**LABSOIL es un sistema de un solo laboratorio, sin multi-tenancy.** Decidido el 25-jul-2026. El stack se mantiene:

- Express + TypeScript + Prisma + PostgreSQL + JWT propio
- **NO** migrar a Supabase/RLS
- **NO** diseñar para multi-tenancy aunque exista una visión de producto más amplia (licenciamiento futuro a otros laboratorios) — esa visión existe pero el usuario prefiere no detallarla todavía. No asumir ni proponer cambios de arquitectura por esto a menos que el usuario lo traiga explícitamente.

## Rol de Claude en este proyecto

Claude actúa como **arquitecto y desarrollador líder**. El usuario aporta expertise de dominio (normas MOP, NCh, ISO) y ejecuta comandos paso a paso — **no escribe código él mismo**. Claude audita el código real (nunca asume desde la memoria de sesiones anteriores), decide, y da instrucciones explícitas de copiar/pegar en la terminal.

## Stack técnico

- Node.js + Express 5 + TypeScript
- Prisma 6.19.0 (⚠️ hay upgrade a 7.x pendiente, planeado como tarea separada — no mezclar con otro trabajo)
- PostgreSQL vía Neon serverless (región `sa-east-1`, São Paulo)
- JWT propio (`jsonwebtoken` + `bcryptjs`), sin librerías de auth externas
- Ejecuta con `ts-node` (`npm run dev`) — **no usa build compilado en desarrollo**
- Corre en GitHub Codespace (VS Code en navegador)

## Estructura del repo

Estructura de carpetas (src/):
- controllers/ : un controller por entidad (users, samples, testResults, atterbergController, granulometry, proctor, molds, orders, test, auth)
- routes/ : un router por entidad, montados en server.ts bajo /api/*
- services/ : logica de negocio mas compleja (hoy solo proctor.service.ts)
- utils/ : helpers compartidos
- middlewares/ : auth.ts (requireAuth, requireRole)
- scripts/ : scripts de mantenimiento ejecutables con ts-node
- domain/granulometry/ : CODIGO MUERTO, ver seccion de deuda tecnica
- prismaClient.ts : singleton de PrismaClient (usar SIEMPRE este, nunca instanciar new PrismaClient() en un controller)
- server.ts : entrypoint, monta todos los routers bajo /api/*

Estructura de carpetas (prisma/):
- schema.prisma
- migrations/

## Patrones establecidos (seguir, no reinventar)

- **Prisma singleton obligatorio.** Nunca `new PrismaClient()` dentro de un controller — usar `import prisma from "../prismaClient"`. Instanciar por controller agota conexiones en Neon serverless (ya pasó una vez con `molds.controller.ts`, corregido).
- **Trazabilidad ISO 17025 vía `registerAudit()`** (`src/utils/auditLog.ts`). Todo controller que escribe (create/update/approve) debe llamar a `registerAudit()` con `userId`, `action`, `entityType`, `entityId`, `previousValue`, `newValue`. Ya integrado en los 9 controllers de escritura.
- **Regla de aprobación** (`src/utils/approvalGuard.ts`): los 4 modelos de resultado (`TestResult`, `Atterberg`, `Granulometry`, `Proctor`) tienen `isApproved / approvedById / approvedAt`. Al editar un registro ya aprobado: `reason` es obligatorio (`assertReasonIfApproved`) y la edición revierte `isApproved` a `false` automáticamente (`approvalResetIfNeeded`), quedando pendiente de re-visado. Roles que pueden aprobar: `ADMIN`, `JEFE`, `CALIDAD` — nunca `LABORATORISTA` (segregación de funciones).
- **Un solo camino de escritura por entidad.** No duplicar routers para el mismo recurso (pasó con Atterberg — corregido 02-ago-2026, ver deuda técnica resuelta abajo).
- Baja lógica en vez de DELETE físico donde aplica (ej. `Mold.status = OUT_OF_SERVICE`).
- **Separación de areas del laboratorio (Sample.area, LabArea enum).** El laboratorio trabaja con normativas distintas segun el area: SOIL_MECHANICS (mecanica de suelos), CONCRETE_AGGREGATES (hormigon y aridos), MINE_INTERIOR (ensayos interior mina). NO deben mezclarse -- ej: existe una norma paralela de granulometria para aridos (MOP 8.202.3) con tolerancias distintas a la de suelos (MOP 8.102.1). Cada modulo de ensayo nuevo DEBE validar que Sample.area coincida con el area a la que pertenece ese ensayo antes de crear el registro (ver el guard ya implementado en Atterberg/Granulometry/Proctor como ejemplo a replicar). Confirmado con el usuario 02-ago-2026, commit 47ae6e5.

## Conocimiento normativo fijo (no cuestionar sin fuente MOP explícita)

- **N°4 = 5 mm** bajo MOP 8.102.1 (NO 4,75 mm, que es criterio ASTM D422).
- **N°40 = 0,425 mm** (ASTM E11, coincide con MOP — sin discrepancia normativa acá, a diferencia de N°4).
- **N°200 = 0,075 mm** (0,08 mm también se acepta como redondeo en el código).
- Los `sieveLabel` en la base de datos reales están en formato "pelado": `N4`, `N10`, `N40`, `N200` — sin símbolo `°` ni la letra `o` de "No". Cualquier matching de texto sobre `sieveLabel` debe considerar este formato explícitamente (ver `granulometryCalc.ts`).
- **CBR (Índice de Soporte California) se norma por NCh1852.Of81** (no MOP 8.102.x). Procedimiento confirmado por el usuario 11-ago-2026: 3 puntos de compactación (12/25/56 golpes por capa, 5 capas), inmersión 4 días (96h) con lectura de hinchamiento, CBR de cada punto contra presiones patrón **70.3 kg/cm² (0.1")** y **105.5 kg/cm² (0.2")** — el mayor de los dos. El **CBR de diseño** se interpola al 95% de la DMCS del Proctor de la misma muestra (ver `cbrCalc.ts`).
- **Densidad de Partículas Sólidas se norma por NCh1532.Of80** (equivalente ASTM D854-58), método del picnómetro. Aplica solo a partículas < 5mm (partículas > 5mm van por NCh1117, fuera de alcance por ahora — ver deuda técnica). Fórmula: `ρs = ms / (ms + Ma(tx) − Mm) · ρw(tx)`, con `Ma(tx) = Ma(ti) − Mf + Mf·[ρw(tx)/ρw(ti)]` calculado desde la calibración del picnómetro. Tabla de densidad del agua (16–29°C, interpolación lineal) en `particleDensityCalc.ts` — no extrapolar fuera de ese rango. Sin qaStatus bloqueante: la norma no define umbral numérico, solo recomienda repetir el ensayo como verificación cruzada.

## Deuda tecnica conocida (inventario, no resolver sin indicacion explicita)

El unico motor de granulometria activo es src/utils/granulometryCalc.ts (implementa MOP 8.102.1 completo, formulas 6.2/6.3, desde 02-ago-2026). El unico motor de Proctor activo es src/utils/proctorCalc.ts, importado por proctor.service.ts. El unico motor de CBR activo es src/utils/cbrCalc.ts, importado por cbr.service.ts (NCh1852.Of81, desde 11-ago-2026) -- CBR depende de un Proctor ya existente de la misma muestra (proctorId obligatorio en Cbr) para el CBR de diseno al 95% DMCS. El unico motor de Densidad de Particulas Solidas activo es src/utils/particleDensityCalc.ts, importado por particleDensity.service.ts (NCh1532.Of80, desde 12-ago-2026) -- depende de un Pycnometer ya calibrado (Mf/Ma(ti)/ti obligatorios antes de poder calcular ρs).

Caso mixto de Densidad de Particulas Solidas (muestra con fraccion >5mm y <5mm, promedio ponderado por masa seca entre NCh1532.Of80 y NCh1117) : NO implementado, fuera de alcance por decision explicita del usuario 12-ago-2026. Solo cubre el caso <5mm (metodo picnometro), que es el uso predominante del laboratorio. Si se requiere el caso mixto a futuro, es una fase separada -- no iniciar de oficio.

Modelos de Prisma sin implementar (existen en schema, sin controller ni rutas):
- Alert, Attachment : reservados para funcionalidad futura, no tocar sin indicacion explicita del usuario.

Resueltos recientemente (referencia historica, ya no son deuda activa):
- Rutas duplicadas de Atterberg : resuelto 02-ago-2026, commit 656923a.
- Falso positivo QA falta N40 : resuelto 02-ago-2026, commit 7ed98cc.
- upsertAtterberg perdia method y notes en PUT parcial : resuelto sesion 01-ago-2026.
- QA por fraccion MOP 8.102.1 (formulas 6.2/6.3, tolerancias 5.10) : resuelto 02-ago-2026, commit 26945b6.
- Codigo muerto de granulometria (src/domain/granulometry/ completo + granulometryMassQa.ts, granulometryQa.ts, granulometrySieveQa.ts, uscsPrelim.ts) : eliminado 02-ago-2026, commit 6d579f1.
- Control documental ISO 9001 (Document/DocumentRevision, ciclo UNDER_REVIEW/ACTIVE/OBSOLETE) : implementado 02-ago-2026, commit 41f47f7.
- Ensayo CBR (Cbr/CbrPoint, NCh1852.Of81) : implementado 11-ago-2026, commit fe9ddbc.
- Ensayo Densidad de Particulas Solidas (ParticleDensity + catalogo Pycnometer, NCh1532.Of80) : implementado 12-ago-2026, pendiente de commit. Primer modulo de ensayo con nombres de modelo/archivo en ingles (ParticleDensity, Pycnometer) por consistencia con el resto del schema -- convencion a seguir en modulos futuros salvo indicacion contraria. Picnometro es instrumento trazable propio (catalogo dedicado, mismo patron que Mold: POST /:id/calibrate separado de PUT /:id).

Fase futura habilitada pero NO a iniciar de oficio: validacion completa de los motores de calculo (granulometryCalc.ts, proctorCalc.ts, formula IP de Atterberg). Esperar indicacion explicita del usuario, no es evidente que haga falta, es una fase separada.

## Gotchas operativos (leer antes de tocar codigo)

1. ts-node no hace hot-reload. Despues de pegar cualquier archivo nuevo, hay que reiniciar el servidor manualmente (Ctrl+C y npm run dev) antes de probar en runtime. Si no se reinicia, el servidor sigue sirviendo la version vieja sin ningun error visible.
2. Los pastes por heredoc en la terminal del Codespace pueden fallar silenciosamente o corromper indentacion y bloques con triple backtick (confirmado 02-ago-2026 al escribir este mismo archivo). Despues de CADA paste de archivo, correr grep -n sobre patrones especificos del contenido nuevo, y si el archivo tiene bloques indentados o de codigo, verificar con cat -A que no se hayan perdido saltos de linea o espacios. No asumir que un paste funciono solo porque no tiro error.
3. El puerto real del servidor en este Codespace es 3000, no 4000. server.ts tiene process.env.PORT o 4000 como fallback, pero el .env local define PORT=3000.
4. GitHub raw URLs tienen lag de cache de CDN (varios minutos post-commit). Verificar el SHA del commit antes de confiar en que raw.githubusercontent.com ya refleja el ultimo push.
5. El editor web de GitHub requiere commit explicito. Si se edita ahi, hay que apretar el boton de commit o se pierde el cambio. Despues de editar por web, correr git fetch origin y git pull en el Codespace antes de verificar.
6. moduleResolution node16 es la configuracion correcta en tsconfig.json para el cliente Prisma 6.x con output custom (usa exports map e imports con extension .js, incompatibles con node clasico).
7. En Windows, matar un `npm run dev` corrido en background (ej. via TaskStop del harness) no siempre mata el proceso `node.exe` hijo real (npm spawnea un `node.exe` wrapper que a su vez spawnea el `node.exe` de ts-node) -- puede quedar huerfano, todavia bindeado al puerto, sirviendo codigo viejo sin ningun error visible (el proceso nuevo puede loguear "Server running" igual). Si despues de editar codigo y reiniciar el servidor los cambios no se reflejan en runtime, verificar con `Get-Process -Name node` y matar todo con `Stop-Process -Force` antes de reintentar.

## Comandos esenciales

npm run dev : arrancar servidor (ts-node, sin hot-reload)
npm run check : tsc --noEmit, correr limpio antes de CADA commit
npx prisma migrate dev --name NOMBRE : nueva migracion
npx ts-node src/scripts/checkAudit.ts ENTITY_TYPE ENTITY_ID : inspeccionar el trail de AuditLog de cualquier entidad

## Convenciones de commit y flujo de trabajo

- git add -A (no git add .) para evitar inconsistencias de input en la terminal del Codespace.
- Verificar npm run check limpio ANTES de cada commit, no despues.
- Mensajes de commit descriptivos, en espanol, formato tipo: descripcion corta mas cuerpo con contexto (por que, no solo que).
- El usuario prueba con curl y un token JWT extraido a una variable de shell (TOKEN=$(...)), patron ya establecido, reutilizar.
- Alcance de sesion acotado: los bugs conocidos se registran pero no se resuelven a mitad de otra tarea salvo que bloqueen el objetivo activo.

## Que NO hacer

- No proponer Supabase, RLS, o arquitectura multi-tenant.
- No asumir que el usuario puede leer o escribir codigo, dar instrucciones ejecutables, no snippets para que el edite a mano.
- No dar por buena la ejecucion de un archivo pegado sin la verificacion correspondiente.
- No mezclar el upgrade de Prisma 7.x con otro trabajo.
- No iniciar la fase de validacion de motores de calculo sin pedido explicito.
- No commitear credenciales reales (contrasenas, tokens) a este archivo ni a ningun otro del repo.
