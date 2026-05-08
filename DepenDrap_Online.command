#!/bin/zsh

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="8080"
URL="http://127.0.0.1:${PORT}/login.html"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
LAN_URL=""
if [[ -n "$LAN_IP" ]]; then
  LAN_URL="http://${LAN_IP}:${PORT}/login.html"
fi
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/server.log"
PID_FILE="${LOG_DIR}/server.pid"

mkdir -p "$LOG_DIR"
cd "$APP_DIR" || exit 1

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return
  fi

  return 1
}

server_is_ready() {
  curl -fsS -I "$URL" >/dev/null 2>&1
}

start_server() {
  local python_bin
  python_bin="$(find_python)" || {
    echo "Python が見つかりません。python3 をインストールしてください。"
    exit 1
  }

  echo "DepenDrap Online サーバーを起動しています..."
  nohup "$python_bin" "${APP_DIR}/serve_secure.py" >> "$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
}

wait_for_server() {
  local i
  for i in {1..40}; do
    if server_is_ready; then
      return 0
    fi
    sleep 0.25
  done

  echo "サーバーの起動を確認できませんでした。ログを確認してください:"
  echo "$LOG_FILE"
  exit 1
}

open_browser() {
  if [[ "${DEPENDRAP_NO_OPEN:-}" == "1" ]]; then
    echo "$URL"
    if [[ -n "$LAN_URL" ]]; then
      echo "外部端末用: $LAN_URL"
    fi
    return
  fi

  echo "この端末用: $URL"
  if [[ -n "$LAN_URL" ]]; then
    echo "同じWi-Fi/LANの外部端末用: $LAN_URL"
  fi

  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  else
    echo "ブラウザで開いてください: $URL"
  fi
}

if server_is_ready; then
  echo "既存の DepenDrap Online サーバーに接続します。"
else
  start_server
  wait_for_server
fi

open_browser
