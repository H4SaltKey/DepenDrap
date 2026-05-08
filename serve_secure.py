import http.server
import socketserver
import json
import os
import secrets
import http.cookies
import socket
import threading
from urllib.parse import urlparse

PORT = 8080
HOST = "0.0.0.0" # Back to IPv4 for maximum LAN compatibility
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, 'users.json')

# Load users
if os.path.exists(USERS_FILE):
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        try:
            USERS = json.load(f)
        except json.JSONDecodeError:
            USERS = {}
else:
    USERS = {}

# In-memory game state
GAME_DATA = {
    'gameState': {},
    'initialState': None,
    'fieldCards': [],
    'logs': [],
    'matchReady': {
        'users': {},
        'started': False,
        'gameState': None
    },
    'active_users': {} # username -> timestamp
}

def reset_game_data():
    global GAME_DATA
    GAME_DATA = {
        'gameState': {},
        'initialState': None,
        'fieldCards': [],
        'logs': [],
        'matchReady': {
            'users': {},
            'started': False,
            'gameState': None
        },
        'active_users': {}
    }

# Session management
SESSIONS = {}  # token -> username
GAME_DATA_LOCK = threading.Lock()  # スレッド競合防止

class SecureHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} - {format%args}")

    def guess_type(self, path):
        """Override to guarantee correct MIME types, preventing ERR_BLOCKED_BY_ORB.
        Browsers enforce ORB (Opaque Response Blocking) and will block scripts
        that are not served with a JavaScript MIME type."""
        if path.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        if path.endswith('.css'):
            return 'text/css; charset=utf-8'
        if path.endswith('.html') or path.endswith('.htm'):
            return 'text/html; charset=utf-8'
        if path.endswith('.json'):
            return 'application/json; charset=utf-8'
        if path.endswith('.png'):
            return 'image/png'
        if path.endswith('.jpg') or path.endswith('.jpeg'):
            return 'image/jpeg'
        if path.endswith('.svg'):
            return 'image/svg+xml'
        if path.endswith('.ico'):
            return 'image/x-icon'
        if path.endswith('.mp3'):
            return 'audio/mpeg'
        if path.endswith('.wav'):
            return 'audio/wav'
        return super().guess_type(path)

    def end_headers(self):
        # Add CORS headers to prevent issues with IP-based access
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Cookie')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('X-Content-Type-Options', 'nosniff')
        # Disable caching for JS/HTML files to prevent stale code
        clean_path = self.path.split('?')[0]
        if clean_path.endswith('.js') or clean_path.endswith('.html'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def translate_path(self, path):
        path = urlparse(path).path
        return os.path.join(BASE_DIR, path.lstrip('/'))

    def route_path(self):
        return urlparse(self.path).path
    
    def get_session(self):
        cookie_header = self.headers.get('Cookie')
        if cookie_header:
            cookie = http.cookies.SimpleCookie(cookie_header)
            if 'session_id' in cookie:
                token = cookie['session_id'].value
                return SESSIONS.get(token)
        return None

    def send_json(self, status, data, headers=None):
        self.send_response(status)
        body = json.dumps(data).encode('utf-8')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Cookie')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        # Directly finalize headers without going through our end_headers override
        # (which would add duplicate CORS/Content-Type headers)
        http.server.BaseHTTPRequestHandler.end_headers(self)
        self.wfile.write(body)

    def save_users(self):
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(USERS, f, ensure_ascii=False)

    def do_GET(self):
        path = self.route_path()

        if path == '/login.html' or path.startswith('/css/') or path.startswith('/assets/') or path.startswith('/img/') or path.startswith('/fonts/') or path.startswith('/js/'):
            super().do_GET()
            return

        username = self.get_session()

        if path == '/api/whoami':
            if username:
                self.send_json(200, {'role': username})
            else:
                self.send_json(401, {'error': 'Unauthorized'})
            return

        # NTPライク clock sync エンドポイント
        # クライアントが送った clientSendTime をそのまま返す + サーバー時刻
        if path == '/api/time':
            import time
            self.send_json(200, {
                'serverTime': int(time.time() * 1000),  # ms
                'clientSendTime': int(self.headers.get('X-Client-Time', '0'))
            })
            return

        if path == '/api/state':
            if username:
                import time
                now = time.time()
                with GAME_DATA_LOCK:
                    GAME_DATA['active_users'][username] = now
                    
                    # クリーニング：ゲームが未開始かつ15秒以上誰もアクセスしていなければリセット
                    match_started = GAME_DATA.get('matchReady', {}).get('started', False)
                    if not match_started and GAME_DATA['active_users']:
                        if all(now - ts > 15 for ts in GAME_DATA['active_users'].values()):
                            print("No active users. Resetting room.")
                            reset_game_data()

                    snapshot = json.loads(json.dumps(GAME_DATA))  # スナップショットを取ってロック外でレスポンス
                self.send_json(200, snapshot)
            else:
                self.send_json(401, {'error': 'Unauthorized'})
            return

        if path == '/api/users':
            if username:
                self.send_json(200, {'users': sorted(user for user in USERS.keys() if user != 'H4SaltKey')})
            else:
                self.send_json(401, {'error': 'Unauthorized'})
            return

        if not username:
            if path == '/' or path.endswith('.html'):
                self.send_response(302)
                self.send_header('Location', '/login.html')
                self.end_headers()
                return
            else:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b"Unauthorized")
                return

        super().do_GET()

    def do_POST(self):
        path = self.route_path()
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ""
        data = {}
        try:
            if body: data = json.loads(body)
        except Exception:
            pass

        if path == '/api/register':
            user = data.get('username')
            pwd = data.get('password')
            if not user or not pwd:
                self.send_json(400, {'error': 'Username and password required'})
                return
            if user in USERS:
                self.send_json(400, {'error': 'Username already exists'})
                return
            
            USERS[user] = pwd
            self.save_users()
            self.send_json(200, {'status': 'Account created'})
            return

        if path == '/api/login':
            user = data.get('username')
            pwd = data.get('password')
            if user in USERS and USERS[user] == pwd:
                token = secrets.token_hex(16)
                SESSIONS[token] = user
                
                cookie = http.cookies.SimpleCookie()
                cookie['session_id'] = token
                cookie['session_id']['path'] = '/'
                cookie['session_id']['httponly'] = True
                cookie['session_id']['samesite'] = 'Lax'
                
                self.send_json(200, {'status': 'ok', 'role': user}, headers={'Set-Cookie': cookie['session_id'].OutputString()})
            else:
                self.send_json(401, {'error': 'Invalid credentials'})
            return

        if path == '/api/logout':
            cookie = http.cookies.SimpleCookie()
            cookie['session_id'] = ""
            cookie['session_id']['path'] = '/'
            cookie['session_id']['expires'] = 'Thu, 01 Jan 1970 00:00:00 GMT'
            cookie['session_id']['samesite'] = 'Lax'
            
            token = None
            cookie_header = self.headers.get('Cookie')
            if cookie_header:
                c = http.cookies.SimpleCookie(cookie_header)
                if 'session_id' in c:
                    token = c['session_id'].value
                    if token in SESSIONS:
                        del SESSIONS[token]

            self.send_json(200, {'status': 'logged out'}, headers={'Set-Cookie': cookie['session_id'].OutputString()})
            return

        username = self.get_session()
        if not username:
            self.send_json(401, {'error': 'Unauthorized'})
            return

        if path == '/api/delete-account':
            if username == 'H4SaltKey':
                self.send_json(403, {'error': 'このアカウントは削除できません。'})
                return

            if username in USERS:
                del USERS[username]
                self.save_users()

            tokens_to_delete = [token for token, user in SESSIONS.items() if user == username]
            for token in tokens_to_delete:
                del SESSIONS[token]

            cookie = http.cookies.SimpleCookie()
            cookie['session_id'] = ""
            cookie['session_id']['path'] = '/'
            cookie['session_id']['expires'] = 'Thu, 01 Jan 1970 00:00:00 GMT'
            cookie['session_id']['samesite'] = 'Lax'
            self.send_json(200, {'status': 'deleted'}, headers={'Set-Cookie': cookie['session_id'].OutputString()})
            return

        if path == '/api/save-json':
            username = self.get_session()
            if not username:
                self.send_json(401, {'error': 'Unauthorized'})
                return
            filename = data.get('filename')
            json_content = data.get('data')
            if not filename or json_content is None:
                self.send_json(400, {'error': 'Missing filename or data'})
                return
            
            # Security check: only allow data/ or assets/
            clean_filename = os.path.normpath(filename).replace('\\', '/')
            if not (clean_filename.startswith('data/') or clean_filename.startswith('assets/')):
                 self.send_json(403, {'error': 'Forbidden directory'})
                 return
            
            filepath = os.path.join(BASE_DIR, clean_filename)
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(json_content, f, ensure_ascii=False, indent=2)
            self.send_json(200, {'status': 'Saved'})
            return

        if path == '/api/state':
            import time
            now = time.time()
            with GAME_DATA_LOCK:
                # username は do_POST の認証チェック済み（上の get_session() で取得済み）
                if username:
                    GAME_DATA['active_users'][username] = now

                if 'initialState' in data:
                    # 最初の1回だけ保存
                    if GAME_DATA['initialState'] is None:
                        GAME_DATA['initialState'] = data['initialState']

                if 'gameState' in data:
                    if isinstance(data['gameState'], dict):
                        if data.get('replaceGameState'):
                            # 完全上書き（マッチ開始時など）
                            GAME_DATA['gameState'] = data['gameState']
                        else:
                            def deep_merge(target, source):
                                for k, v in source.items():
                                    if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                                        deep_merge(target[k], v)
                                    else:
                                        target[k] = v
                            deep_merge(GAME_DATA['gameState'], data['gameState'])

                if 'fieldCards' in data:
                    if isinstance(data['fieldCards'], list):
                        # 送信者のカードは完全置き換え、他プレイヤーのカードは保持
                        # これによりカード削除が正しく伝播する
                        kept = [c for c in GAME_DATA.get('fieldCards', [])
                                if c.get('owner') != username]
                        GAME_DATA['fieldCards'] = kept + [
                            c for c in data['fieldCards'] if 'instanceId' in c
                        ]
                    else:
                        GAME_DATA['fieldCards'] = data['fieldCards']

                if 'logs' in data:
                    if isinstance(data['logs'], list):
                        GAME_DATA['logs'].extend(data['logs'])
                        if len(GAME_DATA['logs']) > 100:
                            GAME_DATA['logs'] = GAME_DATA['logs'][-100:]

                # matchReady のリセット（matchReady キーなしでも動作）
                if data.get('resetMatchReady'):
                    GAME_DATA['matchReady'] = {
                        'users': {},
                        'started': False,
                        'gameState': None
                    }
                    GAME_DATA['gameState'] = {}
                    GAME_DATA['initialState'] = None
                    GAME_DATA['fieldCards'] = []
                    GAME_DATA['logs'] = []

                if 'matchReady' in data:
                    incoming = data['matchReady']
                    if isinstance(incoming, dict):
                        current = GAME_DATA.setdefault('matchReady', {'users': {}, 'started': False, 'gameState': None})
                        if 'users' in incoming and isinstance(incoming['users'], dict):
                            for user_key, user_val in incoming['users'].items():
                                if user_val is None:
                                    current.setdefault('users', {}).pop(user_key, None)
                                else:
                                    current.setdefault('users', {})[user_key] = user_val
                        if 'started' in incoming:
                            current['started'] = bool(incoming['started'])
                        if 'gameState' in incoming:
                            current['gameState'] = incoming['gameState']

            self.send_json(200, {'status': 'ok'})
            return

        self.send_response(404)
        self.end_headers()

    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled for security.")
        return None

if __name__ == '__main__':
    os.chdir(BASE_DIR)
    
    # Get LAN IP
    hostname = socket.gethostname()
    try:
        lan_ip = socket.gethostbyname(hostname)
    except:
        lan_ip = "127.0.0.1"
    
    # Also try to get IP by connecting to a dummy address (more reliable)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except:
        pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((HOST, PORT), SecureHandler) as httpd:
        print(f"DepenDrap Online Server started!")
        print(f"Local URL: http://127.0.0.1:{PORT}/login.html")
        print(f"External/LAN URL: http://{lan_ip}:{PORT}/login.html")
        print("Please check if your Firewall allows incoming connections to Python.")
        httpd.serve_forever()
