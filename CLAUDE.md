# Claude 인수인계 문서

> 이 파일을 읽는 Claude는 아래 내용을 숙지하고 바로 작업을 이어가세요.
> 작업 시작 전 반드시 `WORKLOG.md`를 먼저 조회하세요.

---

## 사용자 정보

- **GitHub**: hyoseob-r / hyoseob.r@gmail.com
- **소통 방식**: 존댓말 사용 (항상)
- **작업 스타일**: 여러 컴퓨터(다른 계정)에서 동일한 작업을 병렬 진행. 환경 동기화가 핵심.

---

## 프로젝트 구조

| 레포 | 설명 | Vercel URL |
|------|------|------------|
| `alfred-agent` | 에이전트 어벤저스 (최우선) | https://alfred-agent-nine.vercel.app |
| `launcher` | h's world 런처 페이지 | launcher-git-main-hyoseobs-projects.vercel.app |
| `lottie-studio` | Lottie 파일 편집기 | https://lottie-studio.vercel.app |
| `h-storybook` | 디자인 시스템 → 멀티플랫폼 코드 변환 | https://storybook-livid-chi.vercel.app |

**로컬 경로**: 모든 레포는 `~/Desktop/` 아래에 있습니다.

---

## 최우선 태스크

**에이전트 어벤저스 고도화** — 세상의 모든 문제 해결을 목표로 한다.

---

## 에이전트 어벤저스 현재 구조

### 메인 에이전트
- **Problem-to-Product Agent**: M1(문제발견) → M2(UX구조화) → M3(솔루션설계) → M4(POC빌드) → M5(검증)

### 6인 전문가 Council (M3에서 순차 심층 검토)
1. **Ms. Designer** — UX/인터랙션 (Nielsen 휴리스틱 기반)
2. **Mr. Engineer** — 기술 실현가능성/복잡도
3. **Ms. Strategist** — 비즈니스 전략/시장 타당성
4. **Mr. PM** — 제품 범위/MVP/로드맵
5. **Ms. Data** — KPI/지표/검증 방법
6. **Mr. Marketing** — 채널/바이럴/포지셔닝

### 부가 에이전트
- **Research Agent** — 시장조사
- **UI Pattern Agent** — 모바일 UX 패턴
- **UT Simulation** — 프로토타입 생성 + 페르소나 3인 시뮬레이션
- **Review Agent** — 2-pager 문서 채점 (100점 만점)
- **Compare Agent** — AI 생성 vs 사용자 업로드 문서 비교

---

## 작업 환경 설정 (이 컴퓨터 기준)

- **Shell**: zsh
- **자동 동기화**: `~/sync-repos.sh` → `~/.zshrc`에 등록됨 (터미널 시작 시 자동 실행)
- **Git 계정**: hyoseob-r / hyoseob.r@gmail.com
- **GitHub 인증**: SSH (`~/.ssh/id_ed25519`)
- **배포**: GitHub push → Vercel 자동 배포

### 중요: Vercel 배포 주의사항
커밋 작성자 이메일이 `hyoseob.r@gmail.com`이어야 합니다.
다른 이메일로 커밋하면 Vercel Hobby 플랜에서 배포가 차단됩니다.
```bash
git config --global user.email "hyoseob.r@gmail.com"
git config --global user.name "hyoseob-r"
```

---

## 작업 지침

1. **작업 시작 시** `WORKLOG.md` 먼저 읽기
2. **작업 완료 시** `WORKLOG.md` 업데이트 후 `git push`
3. **존댓말** 사용
4. **폰트**: 모든 앱은 Pretendard (sans-serif)만 사용
5. **에이전트 고도화**가 항상 최우선

---

## 작업 로그 위치

```
~/Desktop/alfred-agent/WORKLOG.md
```
