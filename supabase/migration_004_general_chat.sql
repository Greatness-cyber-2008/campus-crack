-- ============================================================
-- Migration: allows chat_messages.material_id to be null, enabling
-- "general study tutor" mode (chat not tied to any specific upload).
-- Only run this if you already ran migration_003_chat.sql previously
-- with material_id as NOT NULL. Fresh installs using schema.sql or
-- migration_003_chat.sql (current version) don't need this.
-- ============================================================

alter table chat_messages alter column material_id drop not null;
