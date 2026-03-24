-- profiles table (extends auth.users)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  institution TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- sessions table
CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  speaker_name       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'extracting', 'generating', 'completed', 'failed')),
  error_message      TEXT,
  zip_storage_path   TEXT,
  zip_filename       TEXT,
  zip_size_bytes     BIGINT,
  input_token_count  INTEGER,
  output_token_count INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ
);

CREATE INDEX sessions_professor_id_idx ON sessions (professor_id);
CREATE INDEX sessions_status_idx ON sessions (status);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select_own" ON sessions
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "sessions_insert_own" ON sessions
  FOR INSERT WITH CHECK (professor_id = auth.uid());

CREATE POLICY "sessions_update_own" ON sessions
  FOR UPDATE USING (professor_id = auth.uid());

CREATE POLICY "sessions_delete_own" ON sessions
  FOR DELETE USING (professor_id = auth.uid());

-- uploaded_files table
CREATE TABLE uploaded_files (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  professor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename           TEXT NOT NULL,
  file_type          TEXT NOT NULL,
  size_bytes         BIGINT,
  extracted_text     TEXT,
  char_count         INTEGER,
  extraction_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN ('pending', 'completed', 'skipped', 'failed')),
  skip_reason        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX uploaded_files_session_id_idx ON uploaded_files (session_id);

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uploaded_files_select_own" ON uploaded_files
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "uploaded_files_insert_own" ON uploaded_files
  FOR INSERT WITH CHECK (professor_id = auth.uid());

-- generated_outputs table
CREATE TABLE generated_outputs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  professor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_order  INTEGER NOT NULL,
  section_key    TEXT NOT NULL,
  section_title  TEXT NOT NULL,
  content        TEXT NOT NULL,
  token_count    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX generated_outputs_session_section_idx
  ON generated_outputs (session_id, section_key);

CREATE INDEX generated_outputs_session_id_idx ON generated_outputs (session_id);

ALTER TABLE generated_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_outputs_select_own" ON generated_outputs
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "generated_outputs_insert_own" ON generated_outputs
  FOR INSERT WITH CHECK (professor_id = auth.uid());
