-- Supabase Schema for FI Dashboard Zero-Knowledge Backend
-- Run this in the Supabase SQL Editor after creating a project.

-- User vaults: stores the encryption salt per user.
-- Row is inserted on first sign-in (not during sign-up) to avoid RLS issues
-- when Supabase email confirmation is enabled.
CREATE TABLE user_vaults (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enc_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault records: encrypted data blobs with opaque hashes
CREATE TABLE vault_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_hash TEXT NOT NULL,
  iv TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, record_hash)
);

CREATE INDEX idx_vault_records_user ON vault_records(user_id);

-- Row Level Security: users can only access their own data
ALTER TABLE user_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_vault_own ON user_vaults
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY vault_records_own ON vault_records
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update timestamp on vault_records
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vault_records_updated
  BEFORE UPDATE ON vault_records
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
