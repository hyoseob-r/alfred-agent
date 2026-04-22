-- ============================================================
-- user_tokens 테이블 생성 + RLS
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS user_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  claude_token TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_only" ON user_tokens;
CREATE POLICY "owner_only" ON user_tokens
  FOR ALL USING (user_id = auth.uid());

-- 기존 토큰 전부 삭제 (초기화)
DELETE FROM user_tokens;
