-- Add student_analysis_status column to sessions
ALTER TABLE sessions
  ADD COLUMN student_analysis_status TEXT
    CHECK (student_analysis_status IN ('pending', 'completed', 'failed'))
    DEFAULT NULL;

-- students: one row per unique student per professor
CREATE TABLE students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX students_professor_name_idx ON students (professor_id, display_name);
CREATE INDEX students_professor_id_idx ON students (professor_id);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_select_own" ON students
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "students_insert_own" ON students
  FOR INSERT WITH CHECK (professor_id = auth.uid());

-- student_questions: one row per question, linked to student + session
CREATE TABLE student_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  professor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX student_questions_student_id_idx ON student_questions (student_id);
CREATE INDEX student_questions_session_id_idx ON student_questions (session_id);
CREATE INDEX student_questions_professor_id_idx ON student_questions (professor_id);

ALTER TABLE student_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_questions_select_own" ON student_questions
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "student_questions_insert_own" ON student_questions
  FOR INSERT WITH CHECK (professor_id = auth.uid());

-- student_analyses: one AI profile per student, upserted on each run
CREATE TABLE student_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  professor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  interest_tags TEXT[] NOT NULL DEFAULT '{}',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX student_analyses_student_id_idx ON student_analyses (student_id);

ALTER TABLE student_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_analyses_select_own" ON student_analyses
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "student_analyses_insert_own" ON student_analyses
  FOR INSERT WITH CHECK (professor_id = auth.uid());

CREATE POLICY "student_analyses_update_own" ON student_analyses
  FOR UPDATE USING (professor_id = auth.uid());
