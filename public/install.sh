#!/bin/bash
# Alfred Proxy 설치 스크립트
# 사용법: curl -fsSL https://alfred-agent-nine.vercel.app/install.sh | bash

set -e

INSTALL_DIR="$HOME/alfred-proxy"
API_BASE="https://alfred-agent-nine.vercel.app"
PORT=7432

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     Alfred Proxy 설치                     ║"
echo "║  Claude.ai 구독으로 웹앱 사용 가능         ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Node.js 확인
if ! command -v node &>/dev/null; then
  echo "❌ Node.js가 설치되어 있지 않습니다."
  echo "   https://nodejs.org 에서 설치 후 다시 실행하세요."
  exit 1
fi
echo "✓ Node.js $(node --version)"

# Claude Code 확인
if ! command -v claude &>/dev/null; then
  echo "❌ Claude Code CLI가 없습니다."
  echo "   https://claude.ai/download 에서 Claude Code 설치 후 실행하세요."
  exit 1
fi
echo "✓ Claude Code $(claude --version 2>/dev/null | head -1)"

# 설치 디렉토리 생성
mkdir -p "$INSTALL_DIR"

# GitHub 사용자명 설정
echo ""
EXISTING_USER=""
if [ -f "$INSTALL_DIR/.github_user" ]; then
  EXISTING_USER=$(cat "$INSTALL_DIR/.github_user")
fi

if [ -n "$EXISTING_USER" ]; then
  echo "기존 설정: GitHub 사용자명 = $EXISTING_USER"
  read -p "변경하려면 새 이름 입력 (그냥 Enter = 유지): " NEW_USER
  if [ -n "$NEW_USER" ]; then
    echo "$NEW_USER" > "$INSTALL_DIR/.github_user"
    echo "✓ GitHub 사용자명: $NEW_USER"
  else
    echo "✓ GitHub 사용자명 유지: $EXISTING_USER"
  fi
else
  read -p "GitHub 사용자명 입력 (예: hyoseob-r): " GITHUB_USER
  if [ -z "$GITHUB_USER" ]; then
    echo "⚠ 사용자명 없이 설치합니다. 나중에 다시 설치해 사용자명을 등록하세요."
  else
    echo "$GITHUB_USER" > "$INSTALL_DIR/.github_user"
    echo "✓ GitHub 사용자명: $GITHUB_USER"
  fi
fi

# proxy server.js 다운로드
echo ""
echo "📦 프록시 서버 다운로드 중..."
curl -fsSL "$API_BASE/alfred-proxy/server.js" -o "$INSTALL_DIR/server.js"
echo "✓ server.js 다운로드 완료"

# cloudflared 다운로드
echo "📦 cloudflared 다운로드 중..."
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
else
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
fi
curl -fsSL "$CF_URL" -o /tmp/cloudflared.tgz
tar -xzf /tmp/cloudflared.tgz -C "$INSTALL_DIR/" 2>/dev/null || true
# 압축 해제 후 파일명 정리
if [ -f "$INSTALL_DIR/cloudflared-darwin-amd64" ]; then
  mv "$INSTALL_DIR/cloudflared-darwin-amd64" "$INSTALL_DIR/cloudflared"
elif [ -f "$INSTALL_DIR/cloudflared-darwin-arm64" ]; then
  mv "$INSTALL_DIR/cloudflared-darwin-arm64" "$INSTALL_DIR/cloudflared"
fi
chmod +x "$INSTALL_DIR/cloudflared"
echo "✓ cloudflared 다운로드 완료"

# 실행 스크립트 생성 (PATH 문제 해결)
NODE_PATH=$(which node)
cat > "$INSTALL_DIR/run.sh" << RUNSCRIPT
#!/bin/bash
# Alfred Proxy 실행 스크립트
export PATH="$PATH"
exec "$NODE_PATH" "$INSTALL_DIR/server.js"
RUNSCRIPT
chmod +x "$INSTALL_DIR/run.sh"

# Launch Agent 생성 (Mac 시작 시 자동 실행)
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/com.alfred.proxy.plist"
mkdir -p "$PLIST_DIR"

cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.alfred.proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/run.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/proxy.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/proxy-error.log</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST

# 기존 Launch Agent 언로드 후 새로 로드
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"
echo "✓ 자동 시작 등록 완료 (Mac 재시작해도 자동 실행)"

echo ""
echo "════════════════════════════════════════════"
echo "✅ 설치 완료!"
echo ""
echo "프록시 서버를 지금 바로 시작합니다..."
echo "════════════════════════════════════════════"
echo ""

# 기존 프로세스 종료 후 새로 시작
pkill -f "alfred-proxy/server.js" 2>/dev/null || true
sleep 1
nohup "$INSTALL_DIR/run.sh" > "$INSTALL_DIR/proxy.log" 2>&1 &
echo "서버가 백그라운드에서 시작됐습니다."
echo "로그: tail -f $INSTALL_DIR/proxy.log"
echo ""
echo "잠시 후 alfred-agent-nine.vercel.app 에서 자동 연결됩니다 ✨"
