-- Migration 0009 Rollback: Learning Telemetry Foundation
-- Drops learning_events table and associated indexes safely without acquiring locks on core application tables
DROP TABLE IF EXISTS "learning_events" CASCADE;
