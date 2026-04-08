-- ============================================================
-- RLS 설정 — 모든 데이터를 7df44d62-370e-4527-8025-56d016114ed7 에 귀속
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================================

-- 1. sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON sessions;
CREATE POLICY "owner_only" ON sessions
  FOR ALL USING (user_id = auth.uid());

-- 2. messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON messages;
CREATE POLICY "owner_only" ON messages
  FOR ALL USING (user_id = auth.uid());

-- 3. council_sessions
ALTER TABLE council_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON council_sessions;
CREATE POLICY "owner_only" ON council_sessions
  FOR ALL USING (user_id = auth.uid());

-- 4. context_notes
ALTER TABLE context_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_only" ON context_notes;
CREATE POLICY "owner_only" ON context_notes
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 확인 쿼리 (RLS 적용 여부)
-- ============================================================
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('sessions','messages','council_sessions','context_notes');
