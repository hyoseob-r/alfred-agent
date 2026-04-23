-- Alfred Proxy URL 저장 테이블
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS user_proxies (
  github_login TEXT PRIMARY KEY,
  proxy_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 비활성화 (서비스 키로만 접근)
ALTER TABLE user_proxies DISABLE ROW LEVEL SECURITY;
