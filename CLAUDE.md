# Claude 인수인계 문서 — 완전판

> 이 파일은 **모든 컴퓨터에서 동일한 Claude 동작**을 보장하는 단일 진실 소스입니다.
> git pull 후 이 파일을 읽으면 이전 Claude와 동일하게 작동해야 합니다.

---

## 세션 시작 필수 절차 (반드시 이 순서대로)

**Step 1 — 서버에서 전체 컨텍스트 로드**

```bash
curl -s https://alfred-agent-nine.vercel.app/api/get-context
```

응답의 `briefing`과 `latest_full.rounds`를 전부 읽고 숙지하세요.
사용자 발언(role: "user" 스텝)을 특히 중요하게 읽으세요 — 전략 방향의 핵심 보정이 들어 있습니다.

**Step 2 — WORKLOG.md 조회**

`~/Desktop/alfred-agent/WORKLOG.md` 읽기. 가장 최근 항목부터 확인.

**Step 3 — 한 줄 브리핑**

진행 중인 Council ID, 마지막 합의 사항, 홀드 항목, 다음 액션을 한 문장으로 사용자에게 보고.

> `/resume` 커맨드로도 동일하게 실행 가능합니다.

---

## 사용자 정보

- **GitHub**: hyoseob-r / hyoseob.r@gmail.com
- **소통 방식**: 항상 존댓말(formal Korean) 사용. 예외 없음.
- **작업 스타일**: 여러 컴퓨터(다른 계정)에서 동일한 작업을 병렬 진행. 환경 동기화가 핵심.
- **응답 스타일**: 간결하게. 불필요한 설명 생략. 결론부터.

---

## 프로젝트 구조

| 레포 | 설명 | Vercel URL |
|------|------|------------|
| `alfred-agent` | 에이전트 어벤저스 (최우선) | https://alfred-agent-nine.vercel.app |
| `launcher` | h's world 런처 페이지 | launcher-git-main-hyoseobs-projects.vercel.app |
| `lottie-studio` | Lottie 파일 편집기 | https://lottie-studio.vercel.app |
| `h-storybook` | 디자인 시스템 → 멀티플랫폼 코드 변환 | https://storybook-livid-chi.vercel.app |

**로컬 경로**: 모든 레포는 `~/Desktop/` 아래.

---

## 최우선 태스크

**에이전트 어벤저스 고도화** — 세상의 모든 문제 해결을 목표로 한다.
여러 작업이 동시에 존재할 때 항상 에이전트 고도화 관련 작업을 최우선 처리.

---

## 에이전트 어벤저스 구조

### 메인 에이전트
- **Problem-to-Product Agent**: M1(문제발견) → M2(UX구조화) → M3(솔루션설계) → M4(POC빌드) → M5(검증)

### 6인 전문가 Council + Dr. Veritas (M3 심층 검토)
1. **Ms. Designer** — UX/인터랙션 (Nielsen 휴리스틱 기반)
2. **Mr. Engineer** — 기술 실현가능성/복잡도
3. **Ms. Strategist** — 비즈니스 전략/시장 타당성
4. **Mr. PM** — 제품 범위/MVP/로드맵
5. **Ms. Data** — KPI/지표/검증 방법
6. **Mr. Marketing** — 채널/바이럴/포지셔닝
7. **Dr. Veritas** — 팩트체크/신뢰도 평가

### 부가 에이전트
- **Research Agent**, **UI Pattern Agent**, **UT Simulation**, **Review Agent**, **Compare Agent**

---

## 자동 저장 규칙 (가장 중요 — 반드시 준수)

### 언제 자동으로 저장하는가
다음 상황이 발생하면 **사용자 요청 없이도** 즉시 저장:

1. **사용자가 전략 방향을 바꿀 때** → `save-context` API 호출
2. **사용자가 보정/수정을 줄 때** → council rounds에 user 스텝 추가 + `save-council` upsert
3. **에이전트 토론 라운드 완료 시** → `save-council` upsert
4. **중요한 결정이 내려졌을 때** → `save-context` API 호출
5. **대화가 길어져 컨텍스트 압축 위험이 있을 때** → 즉시 전체 저장

### context_notes 저장 방법

```bash
curl -s -X POST https://alfred-agent-nine.vercel.app/api/save-context \
  -H "Content-Type: application/json" \
  -d '{
    "type": "feedback|decision|strategy|user_pref",
    "title": "고유한 제목 (같은 제목이면 업데이트됨)",
    "content": "내용",
    "tags": ["태그1", "태그2"]
  }'
```

type 분류:
- `feedback` — 사용자가 Claude에게 준 행동 지침
- `decision` — 전략적 결정 사항
- `strategy` — 현재 진행 중인 전략 상태
- `user_pref` — 사용자 선호/스타일

### 지금 이 대화에서 학습한 내용 저장 예시
```bash
# 전략 상태 저장
curl -s -X POST https://alfred-agent-nine.vercel.app/api/save-context \
  -H "Content-Type: application/json" \
  -d '{"type":"strategy","title":"요기요_현재전략상태","content":"버티컬 전략 방향 확정. 포천 파일럿 1순위(경쟁 속 능동적 강세). 건강식 버티컬 홀드(데이터 확인 후). EXIT/사모펀드 목표 없음 — 자체 가치 증명이 핵심.","tags":["요기요","포천","버티컬"]}'
```

## 작업 규칙 (Feedback — 반드시 준수)

### WORKLOG 규칙
- 새 대화 시작 시 `WORKLOG.md` **먼저** 읽기
- 작업 완료/변경 시 `WORKLOG.md` 업데이트 후 `git push`
- **Why**: 여러 컴퓨터에서 현황 공유. GitHub이 유일한 진실 소스.

### Council 저장 규칙
- 에이전트 토론 완료 후 **자동 저장** (사용자 요청 없어도)
- 같은 주제면 같은 ID로 upsert (라운드 누적)
- `type: "c"` 고정 (Claude Code 세션)

```bash
# 새 Council 시작
curl -s -X POST https://alfred-agent-nine.vercel.app/api/save-council \
  -H "Content-Type: application/json" \
  -d '{"type":"c","topic":"...","rounds":[...],"summary":"..."}'

# 이어서 저장 (upsert)
curl -s -X POST https://alfred-agent-nine.vercel.app/api/save-council \
  -H "Content-Type: application/json" \
  -d '{"id":"#c-00001","topic":"...","rounds":[...전체...],"summary":"..."}'
```

- 사용자 발언/보정은 `{"id":"user","role":"[사용자 보정]","result":"..."}` 형식으로 rounds에 포함
- 저장 후 WORKLOG.md 기록 + git push

### 에이전트 테스트 트리거
`#에이전트 테스트`로 시작하는 메시지 → 뒤 내용을 입력으로 간주하고 7인 에이전트 순서대로 직접 실행.
- 순서: Ms. Designer → Mr. Engineer → Ms. Strategist → Mr. PM → Ms. Data → Mr. Marketing → Dr. Veritas
- 각 에이전트는 이전 결과를 context로 누적 수신
- 완료 후 자동으로 Supabase에 저장

---

## 작업 환경 설정

- **Shell**: zsh
- **자동 동기화**: `~/sync-repos.sh` → `~/.zshrc` 등록 (터미널 시작 시 자동 실행)
- **Git 계정**: hyoseob-r / hyoseob.r@gmail.com
- **GitHub 인증**: SSH (`~/.ssh/id_ed25519`)
- **배포**: GitHub push → Vercel 자동 배포

### Vercel 배포 주의사항
커밋 작성자 이메일이 `hyoseob.r@gmail.com`이어야 합니다. 다른 이메일이면 Vercel Hobby 플랜 배포 차단.
```bash
git config user.email "hyoseob.r@gmail.com"
git config user.name "hyoseob-r"
```

---

## 폰트 규칙
모든 앱은 **Pretendard (sans-serif)** 만 사용.

---

## API 엔드포인트 (Vercel Functions)

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /api/get-context` | 인수인계 컨텍스트 로드 (세션 시작 시 필수) |
| `POST /api/save-council` | Council 저장/upsert |
| `POST /api/chat` | 에이전트 채팅 |
| `POST /api/migrate-council` | 구 ID 마이그레이션 (일회성) |

---

## 작업 로그 위치

```
~/Desktop/alfred-agent/WORKLOG.md
```
