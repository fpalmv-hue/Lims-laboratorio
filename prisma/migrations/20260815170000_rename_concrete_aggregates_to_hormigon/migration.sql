-- ============================================================
-- Fase 4 (Aridos): rename de valor de enum LabArea
-- CONCRETE_AGGREGATES -> HORMIGON
--
-- Operacion puramente de metadata (renombra la etiqueta en pg_enum),
-- no reescribe ninguna fila ni toca datos. Probada primero en un
-- branch de Neon aislado (test-labarea-rename, 15-ago-2026) contra
-- una copia real de produccion: 0 filas de Sample usaban
-- CONCRETE_AGGREGATES al momento del rename, blast radius real = 0.
-- ============================================================

ALTER TYPE "LabArea" RENAME VALUE 'CONCRETE_AGGREGATES' TO 'HORMIGON';
