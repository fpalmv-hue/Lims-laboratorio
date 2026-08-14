-- ============================================================
-- Fase 1: Subsistema Equipment / Calibración / Verificación
-- (ISO 17025 — LABSOIL)
-- ============================================================
--
-- Estrategia: migración en una sola transacción SQL.
-- 1. Nuevos enums y tablas (Equipment, EquipmentUsage).
-- 2. Nuevas columnas en Mold/Pycnometer/SandCone (nullable primero).
-- 3. Data migration: crea registros Equipment desde Mold/Pycnometer/
--    SandCone existentes y popula equipmentId.
-- 4. Constraints NOT NULL + UNIQUE + Foreign Keys finales.
-- 5. Drop columnas obsoletas (code/status/lastCalibrationAt/
--    calibrationCertUrl en Mold y Pycnometer; code/status en SandCone).
-- 6. Drop enums obsoletos (MoldStatus, PycnometerStatus, SandConeStatus).
-- 7. Agregar VERIFY a AuditAction enum.
-- 8. Agregar equipmentId a Attachment.
-- ============================================================

-- ── 1a. Nuevos enums ─────────────────────────────────────────
CREATE TYPE "EquipmentCategory" AS ENUM (
  'NORMATIVE',
  'PRECISION',
  'REFERENCE_STANDARD'
);

CREATE TYPE "EquipmentType" AS ENUM (
  'MOLD',
  'PYCNOMETER',
  'SAND_CONE',
  'SCALE',
  'OVEN',
  'REFERENCE_WEIGHT',
  'REFERENCE_THERMOMETER'
);

CREATE TYPE "EquipmentStatus" AS ENUM (
  'ACTIVE',
  'OUT_OF_SERVICE'
);

-- ── 1b. Tabla Equipment ──────────────────────────────────────
CREATE TABLE "Equipment" (
  "id"                 SERIAL      NOT NULL,
  "code"               TEXT        NOT NULL,
  "type"               "EquipmentType"      NOT NULL,
  "category"           "EquipmentCategory"  NOT NULL,
  "description"        TEXT,
  "status"             "EquipmentStatus"    NOT NULL DEFAULT 'ACTIVE',
  "lastCalibrationAt"  TIMESTAMP(3),
  "calibrationDueAt"   TIMESTAMP(3),
  "calibrationBody"    TEXT,
  "lastVerificationAt" TIMESTAMP(3),
  "verificationDueAt"  TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");
CREATE INDEX "Equipment_type_idx"     ON "Equipment"("type");
CREATE INDEX "Equipment_category_idx" ON "Equipment"("category");
CREATE INDEX "Equipment_status_idx"   ON "Equipment"("status");

-- ── 1c. Tabla EquipmentUsage ─────────────────────────────────
CREATE TABLE "EquipmentUsage" (
  "id"          SERIAL       NOT NULL,
  "equipmentId" INTEGER      NOT NULL,
  "entityType"  TEXT         NOT NULL,
  "entityId"    INTEGER      NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentUsage_equipmentId_idx"        ON "EquipmentUsage"("equipmentId");
CREATE INDEX "EquipmentUsage_entityType_entityId_idx" ON "EquipmentUsage"("entityType","entityId");

-- ── 2. Nuevas columnas en tablas de detalle (nullable) ───────
ALTER TABLE "Mold"
  ADD COLUMN "equipmentId"         INTEGER,
  ADD COLUMN "lastVerificationAt"  TIMESTAMP(3),
  ADD COLUMN "verificationDueAt"   TIMESTAMP(3);

ALTER TABLE "Pycnometer"
  ADD COLUMN "equipmentId"         INTEGER,
  ADD COLUMN "lastVerificationAt"  TIMESTAMP(3),
  ADD COLUMN "verificationDueAt"   TIMESTAMP(3);

ALTER TABLE "SandCone"
  ADD COLUMN "equipmentId"                   INTEGER,
  ADD COLUMN "depositVerificationDueAt"      TIMESTAMP(3),
  ADD COLUMN "sandDensityVerificationDueAt"  TIMESTAMP(3);

-- ── 3. Data migration: Equipment desde Mold ──────────────────
-- Mapeo de MoldStatus → EquipmentStatus:
--   'ACTIVE'           → 'ACTIVE'
--   'OUT_OF_SERVICE'   → 'OUT_OF_SERVICE'
-- code y description se copian tal cual (son rotulacion ISO 17025 real).
-- lastCalibrationAt NO se copia → los campos de verificacion quedan null
-- a proposito: el dato de calibracion anterior era ficticio (pruebas).
INSERT INTO "Equipment" ("code","type","category","status","description","createdAt","updatedAt")
SELECT
  m.code,
  'MOLD'::"EquipmentType",
  'NORMATIVE'::"EquipmentCategory",
  CASE m.status
    WHEN 'ACTIVE'         THEN 'ACTIVE'::"EquipmentStatus"
    WHEN 'OUT_OF_SERVICE' THEN 'OUT_OF_SERVICE'::"EquipmentStatus"
    ELSE 'ACTIVE'::"EquipmentStatus"
  END,
  m.description,
  NOW(),
  NOW()
FROM "Mold" m;

UPDATE "Mold" m
SET "equipmentId" = e.id
FROM "Equipment" e
WHERE e.code = m.code
  AND e.type = 'MOLD'::"EquipmentType";

-- ── 3b. Data migration: Equipment desde Pycnometer ───────────
INSERT INTO "Equipment" ("code","type","category","status","description","createdAt","updatedAt")
SELECT
  p.code,
  'PYCNOMETER'::"EquipmentType",
  'NORMATIVE'::"EquipmentCategory",
  CASE p.status
    WHEN 'ACTIVE'         THEN 'ACTIVE'::"EquipmentStatus"
    WHEN 'OUT_OF_SERVICE' THEN 'OUT_OF_SERVICE'::"EquipmentStatus"
    ELSE 'ACTIVE'::"EquipmentStatus"
  END,
  p.description,
  NOW(),
  NOW()
FROM "Pycnometer" p;

UPDATE "Pycnometer" p
SET "equipmentId" = e.id
FROM "Equipment" e
WHERE e.code = p.code
  AND e.type = 'PYCNOMETER'::"EquipmentType";

-- ── 3c. Data migration: Equipment desde SandCone ─────────────
INSERT INTO "Equipment" ("code","type","category","status","description","createdAt","updatedAt")
SELECT
  sc.code,
  'SAND_CONE'::"EquipmentType",
  'NORMATIVE'::"EquipmentCategory",
  CASE sc.status
    WHEN 'ACTIVE'         THEN 'ACTIVE'::"EquipmentStatus"
    WHEN 'OUT_OF_SERVICE' THEN 'OUT_OF_SERVICE'::"EquipmentStatus"
    ELSE 'ACTIVE'::"EquipmentStatus"
  END,
  sc.description,
  NOW(),
  NOW()
FROM "SandCone" sc;

UPDATE "SandCone" sc
SET "equipmentId" = e.id
FROM "Equipment" e
WHERE e.code = sc.code
  AND e.type = 'SAND_CONE'::"EquipmentType";

-- ── 4. Constraints NOT NULL + UNIQUE + FKs ───────────────────
-- Verificacion preventiva: si algun equipmentId quedo null, la
-- constraint NOT NULL a continuacion falla y aborta la transaccion --
-- eso es correcto, significa que habia datos inesperados sin code.
ALTER TABLE "Mold"       ALTER COLUMN "equipmentId" SET NOT NULL;
ALTER TABLE "Pycnometer" ALTER COLUMN "equipmentId" SET NOT NULL;
ALTER TABLE "SandCone"   ALTER COLUMN "equipmentId" SET NOT NULL;

ALTER TABLE "Mold"
  ADD CONSTRAINT "Mold_equipmentId_key" UNIQUE ("equipmentId");
ALTER TABLE "Pycnometer"
  ADD CONSTRAINT "Pycnometer_equipmentId_key" UNIQUE ("equipmentId");
ALTER TABLE "SandCone"
  ADD CONSTRAINT "SandCone_equipmentId_key" UNIQUE ("equipmentId");

ALTER TABLE "Mold"
  ADD CONSTRAINT "Mold_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pycnometer"
  ADD CONSTRAINT "Pycnometer_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SandCone"
  ADD CONSTRAINT "SandCone_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EquipmentUsage"
  ADD CONSTRAINT "EquipmentUsage_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 5. Drop columnas obsoletas ────────────────────────────────
-- Mold
ALTER TABLE "Mold"
  DROP CONSTRAINT IF EXISTS "Mold_code_key",
  DROP COLUMN "code",
  DROP COLUMN "status",
  DROP COLUMN "lastCalibrationAt",
  DROP COLUMN "calibrationCertUrl";

-- Pycnometer
ALTER TABLE "Pycnometer"
  DROP CONSTRAINT IF EXISTS "Pycnometer_code_key",
  DROP COLUMN "code",
  DROP COLUMN "status",
  DROP COLUMN "lastCalibrationAt",
  DROP COLUMN "calibrationCertUrl";

-- SandCone (code y status -- los demas campos son de calibracion y se conservan)
ALTER TABLE "SandCone"
  DROP CONSTRAINT IF EXISTS "SandCone_code_key",
  DROP COLUMN "code",
  DROP COLUMN "status";

-- ── 6. Drop enums obsoletos ───────────────────────────────────
DROP TYPE "MoldStatus";
DROP TYPE "PycnometerStatus";
DROP TYPE "SandConeStatus";

-- ── 7. Agregar VERIFY a AuditAction ──────────────────────────
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERIFY';

-- ── 8. equipmentId en Attachment ─────────────────────────────
ALTER TABLE "Attachment"
  ADD COLUMN "equipmentId" INTEGER;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
