#!/bin/bash

# DepenDrap Online - Socket.io Server Launcher

echo "DepenDrap Online Server"
echo "======================="

# Python 依存関係をインストール
echo "Installing dependencies..."
pip install -r requirements.txt

# サーバーを起動
echo "Starting server on http://localhost:5000"
python3 server.py
