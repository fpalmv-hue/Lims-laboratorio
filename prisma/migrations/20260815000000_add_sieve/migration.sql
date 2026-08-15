-- ============================================================
-- Fase 3b: Subsistema Equipment — Tamices (SIEVE)
-- Migración puramente aditiva: nuevo valor en enum + nueva tabla.
-- No toca ninguna columna existente.
-- ============================================================

-- Agregar SIEVE al enum EquipmentType
ALTER TYPE "EquipmentType" ADD VALUE IF NOT EXISTS 'SIEVE';

-- Crear tabla Sieve (detalle 1:1 con Equipment, mismo patrón que Mold/Pycnometer/SandCone)
CREATE TABLE "Sieve" (
  "id"                  SERIAL        NOT NULL,
  "equipmentId"         INTEGER       NOT NULL,
  "astmDesignation"     TEXT          NOT NULL,
  "openingMm"           DOUBLE PRECISION NOT NULL,
  "lastVerificationAt"  TIMESTAMP(3),
  "verificationDueAt"   TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sieve_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sieve_equipmentId_key" ON "Sieve"("equipmentId");

ALTER TABLE "Sieve"
  ADD CONSTRAINT "Sieve_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
