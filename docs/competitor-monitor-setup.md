# 경쟁사 모니터링 — Supabase 테이블 생성

Supabase 대시보드 SQL Editor에서 실행:

```sql
-- 스냅샷 저장 (크롤링 결과)
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  competitor TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  diff JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_source ON competitor_snapshots(source_id, created_at DESC);

-- 변경 피드 (감지된 변경사항)
CREATE TABLE IF NOT EXISTS competitor_changes (
  id BIGSERIAL PRIMARY KEY,
  competitor TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  change_type TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_changes_competitor ON competitor_changes(competitor, created_at DESC);
```

## API 엔드포인트

| 메서드 | URL | 설명 |
|--------|-----|------|
| POST | /api/competitor-monitor | 크롤링 실행 (App Store 정보 수집 + diff) |
| GET | /api/competitor-monitor | 변경 피드 조회 (?competitor=baemin&limit=20) |

## 모니터링 대상

- 배달의민족 App Store (id: 378084485)
- 쿠팡이츠 App Store (id: 1445504255)
- 우아한형제들 뉴스룸
- 쿠팡 뉴스룸
