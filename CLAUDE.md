]633;E;sed -n '1,30p' CLAUDE.md;9047f330-64e2-4a79-86d4-981a91e72a8b]633;C# CLAUDE.md — LABSOIL

Contexto para cualquier instancia de Claude (u otra IA) que trabaje en este repositorio. Léelo completo antes de tocar código.

## Qué es este proyecto

LABSOIL es un LIMS (Laboratory Information Management System) para un laboratorio de mecánica de suelos en Chile, desarrollado por un Ingeniero en Construcción / Laboratorista Vial (no programador) como software de producción real -- NO es un proyecto academico ni de tesis. El laboratorio busca la acreditación ISO 17025 ante el INN (Instituto Nacional de Normalización de Chile). Los ensayos se implementan según la normativa técnica específica de cada uno: normas NCh directas (ej. NCh1852 CBR, NCh1532 Densidad de Partículas, NCh1117 Gravas, NCh1516 Cono de Arena) y/o sus adaptaciones en el Manual de Carreteras Vol.8 del MOP (ej. §8.102.1 Granulometría, §8.102.2 Humedad, §8.102.9 Cono de Arena) — nunca ambas para el mismo ensayo, se usa la fuente normativa vigente que corresponda a cada caso. Los requisitos funcionales de **ISO 17025 + ISO 9001** se implementan vía trazabilidad de auditoría, control de calibración y flujo de aprobación, no como justificación para cambios de arquitectura. Prioridad estrategica confirmada (02-ago-2026): expandir la cantidad de tipos de ensayo soportados por el backend, no construir un frontend todavia -- eso queda deliberadamente pospuesto.

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
  - **UNICA EXCEPCION confirmada (12-ago-2026): Densidad Neta/Real de Gravas (NCh1117.Of2010, `GravelDensity`) es valido para DOS areas** (`SOIL_MECHANICS` **o** `CONCRETE_AGGREGATES`). La norma es normativamente de aridos para hormigon, pero el laboratorio tambien la usa para la fraccion >5mm de muestras de suelo. No replicar este patron de doble area a otros ensayos sin confirmacion explicita del usuario -- sigue siendo el unico caso.

## Conocimiento normativo fijo (no cuestionar sin fuente MOP explícita)

- **N°4 = 5 mm** bajo MOP 8.102.1 (NO 4,75 mm, que es criterio ASTM D422).
- **N°40 = 0,425 mm** (ASTM E11, coincide con MOP — sin discrepancia normativa acá, a diferencia de N°4).
- **N°200 = 0,075 mm** (0,08 mm también se acepta como redondeo en el código).
- Los `sieveLabel` en la base de datos reales están en formato "pelado": `N4`, `N10`, `N40`, `N200` — sin símbolo `°` ni la letra `o` de "No". Cualquier matching de texto sobre `sieveLabel` debe considerar este formato explícitamente (ver `granulometryCalc.ts`).
- **CBR (Índice de Soporte California) se norma por NCh1852.Of81** (no MOP 8.102.x). Procedimiento confirmado por el usuario 11-ago-2026: 3 puntos de compactación (12/25/56 golpes por capa, 5 capas), inmersión 4 días (96h) con lectura de hinchamiento, CBR de cada punto contra presiones patrón **70.3 kg/cm² (0.1")** y **105.5 kg/cm² (0.2")** — el mayor de los dos. El **CBR de diseño** se interpola al 95% de la DMCS del Proctor de la misma muestra (ver `cbrCalc.ts`).
- **Densidad de Partículas Sólidas se norma por NCh1532.Of80** (equivalente ASTM D854-58), método del picnómetro. Aplica solo a partículas < 5mm (partículas > 5mm van por NCh1117, fuera de alcance por ahora — ver deuda técnica). Fórmula: `ρs = ms / (ms + Ma(tx) − Mm) · ρw(tx)`, con `Ma(tx) = Ma(ti) − Mf + Mf·[ρw(tx)/ρw(ti)]` calculado desde la calibración del picnómetro. Tabla de densidad del agua (16–29°C, interpolación lineal) en `particleDensityCalc.ts` — no extrapolar fuera de ese rango. Sin qaStatus bloqueante: la norma no define umbral numérico, solo recomienda repetir el ensayo como verificación cruzada.
- **Determinación de Humedad se norma por MC Vol.8 §8.102.2** (jun-2022, adaptación de NCh1515-79). Fórmula: `w = 100 · (mh − ms) / (ms − mr)`, aproximado al 0,1%. `dryingTempC` es campo libre (110°C normal, 60°C para suelos con yeso/materia orgánica — Nota 2 de la norma), sin forzar esos valores. Sin qaStatus bloqueante (igual que Densidad de Partículas). **`MoistureContent` está diseñado para ser referenciado por otros ensayos futuros vía FK opcional** (`moistureContentId`) — Cono de Arena lo consume directamente (implementado 12-ago-2026); Proctor/CBR/Densidad de Partículas ya calculan humedad internamente en sus propios flujos sin referenciar este modelo (no se tocó eso retroactivamente, es deuda técnica menor si se quiere unificar a futuro, no urgente).
- **Cono de Arena (Densidad en el Terreno) se norma por MC Vol.8 §8.102.9** (jun-2022, adaptación de NCh1516-79) — **no por NCh1516 cruda**: §8.102.9 es la referencia normativa vigente porque especifica tolerancias numéricas exactas que la norma base no dejaba claras. ⚠️ Hubo una primera implementación (12-ago-2026, nunca comiteada) basada en una lectura incorrecta de las tolerancias — corregida el mismo día antes de cualquier commit, ver detalle abajo.
  - `SandConeTest.moistureContentId` es **obligatorio** — la humedad (ω) se lee del `MoistureContent` referenciado (debe pertenecer a la misma muestra), no se recibe como campo suelto.
  - **Dos equipos**: `SandCone.apparatusType` (`CONVENTIONAL` 6"/≤50mm vs `MACRO` 12"/50-150mm), obligatorio sin default. La coherencia con depósito/balanza (`depositDiameterMm`, `balanceResolutionG`) se valida como **warning informativo, no bloqueante** (no es tolerancia numérica normativa, es dato de catálogo de hardware) — ver `apparatusCoherenceWarning()` en `sandCone.controller.ts`.
  - **Tabla de densidad del agua propia**: `waterDensityTable8102_9.ts` (8-28°C, valores enteros) — **NO comparte tabla** con Densidad de Partículas Sólidas (`waterDensityTable.ts`, 16-29°C), son tablas normativamente distintas aunque el concepto sea igual.
  - **Calibración de densidad de arena (ρA)**: 5 determinaciones, se promedian **TODAS** (no se eligen 3 de 5 — eso era el error de la primera versión). Tolerancia bloqueante: variación entre las 5 **≤ 1,5%** (`SAND_DENSITY_TOLERANCE_PERCENT` en `sandConeCalc.ts`), rechaza con 400 si se excede. ρA final con 2 decimales.
  - **Calibración de embudo/cono (mC)**: se repite **3 veces** (mI/mF cada una) — en la primera versión era una sola medición, eso también estaba mal. Tolerancia bloqueante: variación entre las 3 **≤ 1,0%** (`FUNNEL_TOLERANCE_PERCENT`), rechaza con 400 si se excede. mC final = promedio de las 3.
  - **Fórmula de campo corregida**: `mp = (mti − mtf) − mC` (masa de arena efectivamente en la perforación, descontando lo que queda en el embudo — la primera versión no restaba `mC` explícitamente como campo propio, aunque el resultado final ya lo aplicaba dentro del cálculo de volumen; ahora `mpG` es un campo propio y auditable). Luego: `Vp = mp/ρA`, `ms = mh/(1+ω/100)`, `ρd = ms/Vp` (principal), `ρh = mh/Vp` (informativo).
  - **Nota de interpretación**: la fórmula exacta de "variación %" no está en el resumen normativo disponible — se usa `(máx−mín)/promedio×100` para ambas tolerancias (arena y embudo); si no coincide con el criterio real de §8.102.9, ajustar `variationPercent()` en `sandConeCalc.ts`.
  - **Deuda técnica (Nota 5 de la norma)**: partículas de tamaño superior al máximo del método (>50mm convencional / >150mm macrocono) encontradas en la perforación deben descontarse aparte vía Método 8.202.20 (densidad de pétreos gruesos) — **NO implementado**, fuera de alcance de esta fase, no bloquear ni automatizar sin indicación explícita.
  - Tres endpoints de calibración separados (`/:id/calibrate-deposit`, `/:id/calibrate-sand`, `/:id/calibrate-funnel`) porque cada calibración tiene un shape de datos completamente distinto — mismo criterio que Pycnometer para instrumento vs. resultado (`SandCone` vs `SandConeTest`, rutas `/api/sand-cones` y `/api/sand-cone-tests`).
- **Densidad Neta / Real de Gravas se norma por NCh1117.Of2010** ("Áridos para morteros y hormigones — Determinación de las densidades reales y neta y de la absorción de agua de las gravas"). Aplica a gravas (>4,75mm) de densidad real >2.000 kg/m³. Exige **"muestras gemelas"**: dos determinaciones independientes (A = masa sumergida, B = masa SSS al aire, C = masa seca al aire), con **tolerancia bloqueante entre ellas** (10.3.1 de la norma): ≤30 kg/m³ en cada una de las tres densidades (ρRsss, ρRS, ρN) y ≤0,3% en absorción — si se excede, se rechaza con 400 sin persistir nada (hay que ensayar un par nuevo), mismo criterio que las calibraciones de Cono de Arena. Fórmulas: `ρRsss = B/(B−A)·1000`, `ρRS = C/(B−A)·1000`, `ρN = C/(C−A)·1000`, `absorción% = (B−C)/C·100`. Resultado final = promedio de ambas gemelas (densidades aprox. a 10 kg/m³, absorción a 0,1%). **Único ensayo válido para dos áreas** (ver excepción arriba en "Separación de areas").

## Deuda tecnica conocida (inventario, no resolver sin indicacion explicita)

El unico motor de granulometria activo es src/utils/granulometryCalc.ts (implementa MOP 8.102.1 completo, formulas 6.2/6.3, desde 02-ago-2026). El unico motor de Proctor activo es src/utils/proctorCalc.ts, importado por proctor.service.ts. El unico motor de CBR activo es src/utils/cbrCalc.ts, importado por cbr.service.ts (NCh1852.Of81, desde 11-ago-2026) -- CBR depende de un Proctor ya existente de la misma muestra (proctorId obligatorio en Cbr) para el CBR de diseno al 95% DMCS. El unico motor de Densidad de Particulas Solidas activo es src/utils/particleDensityCalc.ts, importado por particleDensity.service.ts (NCh1532.Of80, desde 12-ago-2026) -- depende de un Pycnometer ya calibrado (Mf/Ma(ti)/ti obligatorios antes de poder calcular ρs). El unico motor de Determinacion de Humedad activo es src/utils/moistureCalc.ts, importado por moistureContent.service.ts (MC Vol.8 §8.102.2, desde 12-ago-2026) -- autocontenido (mr/mh/ms se ingresan directo, sin dependencia de otro instrumento/ensayo). El unico motor de Cono de Arena activo es src/utils/sandConeCalc.ts, importado por sandConeTest.service.ts (MC Vol.8 §8.102.9, desde 12-ago-2026) -- depende de un SandCone con las tres calibraciones completas (Vm/ρA/mC) y de un MoistureContent con wPercent calculado; si falta algo de eso, el calculo devuelve calcNote sin bloquear la creacion del registro (mismo criterio que CBR/Proctor). Nota 5 de la norma (particulas fuera de rango del metodo en terreno, descontar via Metodo 8.202.20) NO implementada, deuda tecnica fuera de alcance. El unico motor de Densidad Neta/Real de Gravas activo es src/utils/gravelDensityCalc.ts, importado por gravelDensity.service.ts (NCh1117.Of2010, desde 12-ago-2026) -- autocontenido (las dos muestras gemelas A/B/C se ingresan directo), pero a diferencia de los demas ensayos la tolerancia entre gemelas es bloqueante en el propio create/update (no hay estado NEEDS_REVIEW con resultado parcial, el registro solo se persiste si paso la tolerancia).

Caso mixto de Densidad de Particulas Solidas (muestra con fraccion >5mm y <5mm, promedio ponderado por masa seca entre NCh1532.Of80 y NCh1117) : NO implementado, fuera de alcance por decision explicita del usuario 12-ago-2026. Solo cubre el caso <5mm (metodo picnometro), que es el uso predominante del laboratorio. El building block de la fraccion >5mm ya existe como ensayo propio (GravelDensity, NCh1117.Of2010, desde 12-ago-2026), pero la logica de promedio ponderado que combine ambos resultados en un solo valor NO esta implementada. Si se requiere el caso mixto a futuro, es una fase separada -- no iniciar de oficio.

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
- Ensayo Densidad de Particulas Solidas (ParticleDensity + catalogo Pycnometer, NCh1532.Of80) : implementado 12-ago-2026, commit 1d8883b. Primer modulo de ensayo con nombres de modelo/archivo en ingles (ParticleDensity, Pycnometer) por consistencia con el resto del schema -- convencion a seguir en modulos futuros salvo indicacion contraria. Picnometro es instrumento trazable propio (catalogo dedicado, mismo patron que Mold: POST /:id/calibrate separado de PUT /:id).
- Ensayo Determinacion de Humedad (MoistureContent, MC Vol.8 §8.102.2) : implementado 12-ago-2026, commit e4fd2b8. Registro plano (sin sub-modelo de puntos), mismo patron que ParticleDensity. Diseñado explicitamente para ser referenciado por FK opcional desde ensayos futuros -- Cono de Arena es el primer consumidor via moistureContentId.
- Ensayo Cono de Arena (SandCone instrumento + SandConeTest, MC Vol.8 §8.102.9) : implementado 12-ago-2026, commit e323ef9. Corregido el mismo dia antes de comitear (ver nota normativa arriba) -- version final usa §8.102.9, no NCh1516 cruda: tolerancias correctas (1.5% arena / 1.0% embudo, ambas <=), arena promedia las 5 (no elige 3), embudo se repite 3 veces (no 1), formula mp resta mC explicitamente. Primer instrumento con calibracion en tres partes independientes (deposito/arena/embudo, tres endpoints separados) y primer ensayo con tolerancias numericas bloqueantes reales en la calibracion. Primer instrumento con dos variantes de equipo (apparatusType CONVENTIONAL/MACRO). Primer ensayo que consume otro ensayo por relacion (moistureContentId -> MoistureContent) en vez de calcular su propia humedad.
- Ensayo Densidad Neta / Real de Gravas (GravelDensity, NCh1117.Of2010) : implementado 12-ago-2026, pendiente de commit. Primer y unico ensayo valido para dos areas (SOIL_MECHANICS o CONCRETE_AGGREGATES, confirmado con el usuario -- ver nota en "Separacion de areas"). Primer ensayo con tolerancia bloqueante evaluada directamente en create/update (no en un endpoint de calibracion separado): "muestras gemelas" (dos determinaciones A/B/C) deben coincidir dentro de 30 kg/m3 (densidades) y 0.3% (absorcion), si no, se rechaza con 400 sin persistir nada. Cubre el building block de la fraccion >5mm que quedaba pendiente en la deuda tecnica de Densidad de Particulas Solidas (el promedio ponderado combinado sigue sin implementar).

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
