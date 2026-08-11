]633;E;sed -n '1,30p' CLAUDE.md;9047f330-64e2-4a79-86d4-981a91e72a8b]633;C# CLAUDE.md — LABSOIL

Contexto para cualquier instancia de Claude (u otra IA) que trabaje en este repositorio. Léelo completo antes de tocar código.

## Qué es este proyecto

LABSOIL es un LIMS (Laboratory Information Management System) para un laboratorio de mecánica de suelos en Chile, desarrollado como proyecto de título/tesis por un Ingeniero en Construcción / Laboratorista Vial (no programador). El laboratorio certifica bajo **MOP 8.102.1** (norma chilena de vialidad) y tiene requisitos funcionales reales de **ISO 17025 + ISO 9001** (acreditación INN Chile) — implementados vía trazabilidad de auditoría, control de calibración y flujo de aprobación, no como justificación para cambios de arquitectura.

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

## Conocimiento normativo fijo (no cuestionar sin fuente MOP explícita)

- **N°4 = 5 mm** bajo MOP 8.102.1 (NO 4,75 mm, que es criterio ASTM D422).
- **N°40 = 0,425 mm** (ASTM E11, coincide con MOP — sin discrepancia normativa acá, a diferencia de N°4).
- **N°200 = 0,075 mm** (0,08 mm también se acepta como redondeo en el código).
- Los `sieveLabel` en la base de datos reales están en formato "pelado": `N4`, `N10`, `N40`, `N200` — sin símbolo `°` ni la letra `o` de "No". Cualquier matching de texto sobre `sieveLabel` debe considerar este formato explícitamente (ver `granulometryCalc.ts`).

## Deuda tecnica conocida (inventario, no resolver sin indicacion explicita)

El unico motor de granulometria activo es src/utils/granulometryCalc.ts (implementa MOP 8.102.1 completo, formulas 6.2/6.3, desde 02-ago-2026). El unico motor de Proctor activo es src/utils/proctorCalc.ts, importado por proctor.service.ts.

Modelos de Prisma sin implementar (existen en schema, sin controller ni rutas):
- Alert, Attachment, Document, DocumentRevision : reservados para funcionalidad futura, no tocar sin indicacion explicita del usuario. Document/DocumentRevision son el siguiente gap mas importante identificado (control documental ISO 9001).

Resueltos recientemente (referencia historica, ya no son deuda activa):
- Rutas duplicadas de Atterberg : resuelto 02-ago-2026, commit 656923a.
- Falso positivo QA falta N40 : resuelto 02-ago-2026, commit 7ed98cc.
- upsertAtterberg perdia method y notes en PUT parcial : resuelto sesion 01-ago-2026.
- QA por fraccion MOP 8.102.1 (formulas 6.2/6.3, tolerancias 5.10) : resuelto 02-ago-2026, commit 26945b6.
- Codigo muerto de granulometria (src/domain/granulometry/ completo + granulometryMassQa.ts, granulometryQa.ts, granulometrySieveQa.ts, uscsPrelim.ts) : eliminado 02-ago-2026, commit 6d579f1.

Fase futura habilitada pero NO a iniciar de oficio: validacion completa de los motores de calculo (granulometryCalc.ts, proctorCalc.ts, formula IP de Atterberg). Esperar indicacion explicita del usuario, no es evidente que haga falta, es una fase separada.

## Gotchas operativos (leer antes de tocar codigo)

1. ts-node no hace hot-reload. Despues de pegar cualquier archivo nuevo, hay que reiniciar el servidor manualmente (Ctrl+C y npm run dev) antes de probar en runtime. Si no se reinicia, el servidor sigue sirviendo la version vieja sin ningun error visible.
2. Los pastes por heredoc en la terminal del Codespace pueden fallar silenciosamente o corromper indentacion y bloques con triple backtick (confirmado 02-ago-2026 al escribir este mismo archivo). Despues de CADA paste de archivo, correr grep -n sobre patrones especificos del contenido nuevo, y si el archivo tiene bloques indentados o de codigo, verificar con cat -A que no se hayan perdido saltos de linea o espacios. No asumir que un paste funciono solo porque no tiro error.
3. El puerto real del servidor en este Codespace es 3000, no 4000. server.ts tiene process.env.PORT o 4000 como fallback, pero el .env local define PORT=3000.
4. GitHub raw URLs tienen lag de cache de CDN (varios minutos post-commit). Verificar el SHA del commit antes de confiar en que raw.githubusercontent.com ya refleja el ultimo push.
5. El editor web de GitHub requiere commit explicito. Si se edita ahi, hay que apretar el boton de commit o se pierde el cambio. Despues de editar por web, correr git fetch origin y git pull en el Codespace antes de verificar.
6. moduleResolution node16 es la configuracion correcta en tsconfig.json para el cliente Prisma 6.x con output custom (usa exports map e imports con extension .js, incompatibles con node clasico).

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
