-- ============================================================
-- 기존 데이터 user_id 통일 마이그레이션
-- COUNCIL_USER_ID 로 저장된 기존 rows를 실제 auth UUID로 업데이트
-- 주의: RLS 적용 전에 먼저 실행할 것
-- ============================================================

-- 실제 auth UUID
-- 7df44d62-370e-4527-8025-56d016114ed7

-- 현재 어떤 user_id 값들이 있는지 확인 먼저
SELECT DISTINCT user_id, count(*) FROM sessions GROUP BY user_id;
SELECT DISTINCT user_id, count(*) FROM messages GROUP BY user_id;
SELECT DISTINCT user_id, count(*) FROM council_sessions GROUP BY user_id;
SELECT DISTINCT user_id, count(*) FROM context_notes GROUP BY user_id;

-- 위 확인 후, 7df44d62... 이 아닌 user_id 가 있으면 아래 실행
-- (기존 COUNCIL_USER_ID 값으로 대체)
-- UPDATE sessions SET user_id = '7df44d62-370e-4527-8025-56d016114ed7' WHERE user_id = '<기존_COUNCIL_USER_ID>';
-- UPDATE messages SET user_id = '7df44d62-370e-4527-8025-56d016114ed7' WHERE user_id = '<기존_COUNCIL_USER_ID>';
-- UPDATE council_sessions SET user_id = '7df44d62-370e-4527-8025-56d016114ed7' WHERE user_id = '<기존_COUNCIL_USER_ID>';
-- UPDATE context_notes SET user_id = '7df44d62-370e-4527-8025-56d016114ed7' WHERE user_id = '<기존_COUNCIL_USER_ID>';
