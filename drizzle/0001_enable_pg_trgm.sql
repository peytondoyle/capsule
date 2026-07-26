-- Trigram search backs all three search boxes in the design: the Ledger's
-- "search 412 objects", the Board's filter rail, and the Cabinet's
-- "lot no., person, place". Must exist before the GIN indexes in 0002.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
