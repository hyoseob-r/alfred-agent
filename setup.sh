#!/bin/bash
# ============================================================
# Alfred Agent — 새 컴퓨터 초기화 스크립트
# 사용법: bash setup.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "🚀 Alfred Agent 환경 초기화 시작"
echo "=================================="

# ── 1. Git 설정 ──────────────────────────────────────────
echo ""
echo "${YELLOW}[1/5] Git 설정${NC}"
git config user.email "hyoseob.r@gmail.com"
git config user.name "hyoseob-r"
echo "${GREEN}✓ git config — hyoseob-r / hyoseob.r@gmail.com${NC}"

# ── 2. 최신 코드 pull ────────────────────────────────────
echo ""
echo "${YELLOW}[2/5] 최신 코드 pull${NC}"
git pull origin main
echo "${GREEN}✓ git pull 완료${NC}"

# ── 3. Claude Code 글로벌 설정 (~/.claude/CLAUDE.md) ─────
echo ""
echo "${YELLOW}[3/5] Claude Code 글로벌 Bootstrap 설정${NC}"
CLAUDE_GLOBAL="$HOME/.claude/CLAUDE.md"
mkdir -p "$HOME/.claude"
cat > "$CLAUDE_GLOBAL" << 'EOF'
# Bootstrap — 세션 시작 시 반드시 실행

어떤 컴퓨터, 어떤 계정에서 Claude Code를 시작하든 **가장 먼저** 아래를 실행하세요.

```bash
curl -s https://alfred-agent-nine.vercel.app/api/get-context
```

응답에서:
1. `claude_md` 필드 → **이 세션의 주 지침으로 채택**. 여기 적힌 모든 규칙을 따르세요.
2. `briefing` 필드 → 진행 중인 작업 현황을 사용자에게 한 줄로 보고하세요.

> 이 파일은 bootstrap입니다. 실제 지침은 API 응답의 claude_md에 있습니다.
EOF
echo "${GREEN}✓ ~/.claude/CLAUDE.md (bootstrap) 생성 완료${NC}"

# ── 4. SSH 키 존재 확인 ──────────────────────────────────
echo ""
echo "${YELLOW}[4/5] SSH 키 확인${NC}"
if [ -f "$HOME/.ssh/id_ed25519" ]; then
  echo "${GREEN}✓ SSH 키 존재: ~/.ssh/id_ed25519${NC}"
else
  echo "${RED}✗ SSH 키 없음. 아래 명령어로 생성 후 GitHub에 등록하세요:${NC}"
  echo "   ssh-keygen -t ed25519 -C \"hyoseob.r@gmail.com\""
  echo "   cat ~/.ssh/id_ed25519.pub  # 이 내용을 GitHub SSH Keys에 추가"
fi

# ── 5. 컨텍스트 로드 테스트 ──────────────────────────────
echo ""
echo "${YELLOW}[5/5] 서버 컨텍스트 로드 테스트${NC}"
CONTEXT=$(curl -s https://alfred-agent-nine.vercel.app/api/get-context 2>/dev/null)
if echo "$CONTEXT" | grep -q "briefing"; then
  SESSIONS=$(echo "$CONTEXT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('sessions',[])))" 2>/dev/null || echo "?")
  ROUNDS=$(echo "$CONTEXT" | python3 -c "import sys,json; d=json.load(sys.stdin); lf=d.get('latest_full'); print(lf['rounds_count'] if lf else 0)" 2>/dev/null || echo "?")
  echo "${GREEN}✓ 컨텍스트 로드 성공 — Council ${SESSIONS}개, 최신 ${ROUNDS}라운드${NC}"
else
  echo "${RED}✗ 컨텍스트 로드 실패. 네트워크 또는 서버를 확인하세요.${NC}"
fi

# ── 완료 ─────────────────────────────────────────────────
echo ""
echo "=================================="
echo "${GREEN}✅ 초기화 완료${NC}"
echo ""
echo "다음 단계:"
echo "  1. Claude Code 실행: claude"
echo "  2. 컨텍스트 자동 로드됨 (CLAUDE.md → /api/get-context)"
echo "  3. 또는 /resume 커맨드로 수동 브리핑"
echo ""
