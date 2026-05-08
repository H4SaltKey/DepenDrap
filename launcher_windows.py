import os
import subprocess
import sys
import time
import urllib.request
import webbrowser


PORT = 8080
URL = f"http://127.0.0.1:{PORT}/login.html"


def app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def is_server_ready():
    try:
        request = urllib.request.Request(URL, method="HEAD")
        with urllib.request.urlopen(request, timeout=1):
            return True
    except Exception:
        return False


def start_server(root):
    python = sys.executable if not getattr(sys, "frozen", False) else "python"
    server = os.path.join(root, "serve_secure.py")
    logs = os.path.join(root, "logs")
    os.makedirs(logs, exist_ok=True)
    log_path = os.path.join(logs, "server.log")

    with open(log_path, "a", encoding="utf-8") as log:
        subprocess.Popen(
            [python, server],
            cwd=root,
            stdout=log,
            stderr=log,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )


def wait_for_server():
    for _ in range(40):
        if is_server_ready():
            return True
        time.sleep(0.25)
    return False


def main():
    root = app_dir()

    if not is_server_ready():
        start_server(root)
        if not wait_for_server():
            print("サーバーを起動できませんでした。logs/server.log を確認してください。")
            input("Enterキーで終了します...")
            return 1

    webbrowser.open(URL)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

