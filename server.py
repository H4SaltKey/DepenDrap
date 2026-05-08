#!/usr/bin/env python3
"""
DepenDrap Online - Socket.io Server
ターン制ゲーム用マルチプレイヤーサーバー
"""

import os
import json
import uuid
import logging
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/server.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Flask アプリ設定
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# ゲーム状態管理
class GameRoom:
    def __init__(self, room_id, room_name):
        self.room_id = room_id
        self.room_name = room_name
        self.players = {}  # {sid: player_data}
        self.created_at = datetime.now()
        self.game_state = None
        self.is_active = False
    
    def add_player(self, sid, username, role):
        self.players[sid] = {
            'sid': sid,
            'username': username,
            'role': role,
            'ready': False,
            'joined_at': datetime.now().isoformat()
        }
        logger.info(f"Player {username} ({role}) joined room {self.room_name}")
    
    def remove_player(self, sid):
        if sid in self.players:
            username = self.players[sid]['username']
            del self.players[sid]
            logger.info(f"Player {username} left room {self.room_name}")
    
    def get_player_count(self):
        return len(self.players)
    
    def is_full(self):
        return self.get_player_count() >= 2
    
    def get_other_player(self, sid):
        for player_sid, player_data in self.players.items():
            if player_sid != sid:
                return player_data
        return None

# グローバル状態
rooms_dict = {}  # {room_id: GameRoom}
player_rooms = {}  # {sid: room_id}

# ===== ルート =====

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/<path:filename>')
def serve_file(filename):
    return app.send_static_file(filename)

# ===== Socket.io イベント =====

@socketio.on('connect')
def on_connect():
    logger.info(f"Client connected: {request.sid}")
    emit('connect_response', {'data': 'Connected to server'})

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    logger.info(f"Client disconnected: {sid}")
    
    # プレイヤーがいたルームから削除
    if sid in player_rooms:
        room_id = player_rooms[sid]
        if room_id in rooms_dict:
            room = rooms_dict[room_id]
            room.remove_player(sid)
            
            # ルームが空になったら削除
            if room.get_player_count() == 0:
                del rooms_dict[room_id]
                logger.info(f"Room {room_id} deleted (empty)")
            else:
                # 残りのプレイヤーに通知
                socketio.emit('opponent_left', {'message': 'Opponent disconnected'}, room=room_id)
        
        del player_rooms[sid]

@socketio.on('create_room')
def on_create_room(data):
    sid = request.sid
    room_name = data.get('room_name', '').strip().upper()
    username = data.get('username', 'Player')
    
    # ルーム名が空なら自動生成
    if not room_name:
        room_name = f"ROOM_{uuid.uuid4().hex[:6].upper()}"
    
    # 既に別のルームにいないか確認
    if sid in player_rooms:
        emit('error', {'message': 'Already in a room'})
        return
    
    # ルームが既に存在するか確認
    room_id = None
    for rid, room in rooms_dict.items():
        if room.room_name == room_name:
            room_id = rid
            break
    
    # 新しいルームを作成
    if room_id is None:
        room_id = str(uuid.uuid4())
        room = GameRoom(room_id, room_name)
        rooms_dict[room_id] = room
        logger.info(f"Room created: {room_name} ({room_id})")
    else:
        room = rooms_dict[room_id]
    
    # ルームが満杯でないか確認
    if room.is_full():
        emit('error', {'message': 'Room is full'})
        return
    
    # プレイヤーをルームに追加
    role = 'player1' if room.get_player_count() == 0 else 'player2'
    room.add_player(sid, username, role)
    player_rooms[sid] = room_id
    
    # Socket.io ルームに参加
    join_room(room_id)
    
    # クライアントに確認を送信
    emit('room_created', {
        'room_id': room_id,
        'room_name': room_name,
        'role': role,
        'player_count': room.get_player_count()
    })
    
    # ルーム内の全プレイヤーに通知
    socketio.emit('player_joined', {
        'username': username,
        'role': role,
        'player_count': room.get_player_count()
    }, room=room_id)
    
    logger.info(f"Player {username} created/joined room {room_name}")

@socketio.on('join_room')
def on_join_room(data):
    sid = request.sid
    room_name = data.get('room_name', '').strip().upper()
    username = data.get('username', 'Player')
    
    if not room_name:
        emit('error', {'message': 'Room name is required'})
        return
    
    # 既に別のルームにいないか確認
    if sid in player_rooms:
        emit('error', {'message': 'Already in a room'})
        return
    
    # ルームを検索
    room_id = None
    for rid, room in rooms_dict.items():
        if room.room_name == room_name:
            room_id = rid
            break
    
    if room_id is None:
        emit('error', {'message': 'Room not found'})
        return
    
    room = rooms_dict[room_id]
    
    # ルームが満杯でないか確認
    if room.is_full():
        emit('error', {'message': 'Room is full'})
        return
    
    # プレイヤーをルームに追加
    role = 'player1' if room.get_player_count() == 0 else 'player2'
    room.add_player(sid, username, role)
    player_rooms[sid] = room_id
    
    # Socket.io ルームに参加
    join_room(room_id)
    
    # クライアントに確認を送信
    emit('room_joined', {
        'room_id': room_id,
        'room_name': room_name,
        'role': role,
        'player_count': room.get_player_count()
    })
    
    # ルーム内の全プレイヤーに通知
    socketio.emit('player_joined', {
        'username': username,
        'role': role,
        'player_count': room.get_player_count()
    }, room=room_id)
    
    logger.info(f"Player {username} joined room {room_name}")

@socketio.on('get_room_list')
def on_get_room_list():
    room_list = []
    for room_id, room in rooms_dict.items():
        if not room.is_full():  # 満杯でないルームのみ
            room_list.append({
                'room_id': room_id,
                'room_name': room.room_name,
                'player_count': room.get_player_count(),
                'max_players': 2
            })
    emit('room_list', {'rooms': room_list})

@socketio.on('mark_ready')
def on_mark_ready(data):
    sid = request.sid
    is_ready = data.get('ready', False)
    
    if sid not in player_rooms:
        emit('error', {'message': 'Not in a room'})
        return
    
    room_id = player_rooms[sid]
    room = rooms_dict[room_id]
    
    if sid not in room.players:
        emit('error', {'message': 'Player not found in room'})
        return
    
    room.players[sid]['ready'] = is_ready
    
    # ルーム内の全プレイヤーに通知
    socketio.emit('player_ready_status', {
        'role': room.players[sid]['role'],
        'ready': is_ready
    }, room=room_id)
    
    # 両プレイヤーが準備完了したか確認
    all_ready = all(p['ready'] for p in room.players.values()) and len(room.players) == 2
    if all_ready:
        socketio.emit('both_ready', {
            'message': 'Both players ready! Starting game...'
        }, room=room_id)
        logger.info(f"Both players ready in room {room.room_name}")

@socketio.on('send_game_state')
def on_send_game_state(data):
    sid = request.sid
    
    if sid not in player_rooms:
        emit('error', {'message': 'Not in a room'})
        return
    
    room_id = player_rooms[sid]
    
    # ルーム内の他のプレイヤーに送信
    socketio.emit('receive_game_state', data, room=room_id, skip_sid=sid)

@socketio.on('send_action')
def on_send_action(data):
    sid = request.sid
    
    if sid not in player_rooms:
        emit('error', {'message': 'Not in a room'})
        return
    
    room_id = player_rooms[sid]
    
    # ルーム内の他のプレイヤーに送信
    socketio.emit('receive_action', data, room=room_id, skip_sid=sid)

@socketio.on('leave_room')
def on_leave_room():
    sid = request.sid
    
    if sid not in player_rooms:
        emit('error', {'message': 'Not in a room'})
        return
    
    room_id = player_rooms[sid]
    room = rooms_dict[room_id]
    
    room.remove_player(sid)
    leave_room(room_id)
    del player_rooms[sid]
    
    # ルーム内の他のプレイヤーに通知
    socketio.emit('opponent_left', {'message': 'Opponent left the room'}, room=room_id)
    
    # ルームが空になったら削除
    if room.get_player_count() == 0:
        del rooms_dict[room_id]
        logger.info(f"Room {room_id} deleted (empty)")

# ===== メイン =====

if __name__ == '__main__':
    os.makedirs('logs', exist_ok=True)
    logger.info("Starting DepenDrap Online Server...")
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
