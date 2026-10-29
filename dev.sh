#!/usr/bin/env bash

tmux new-session -d -s dev -c "$PWD/server" 'pnpm run dev; echo "SERVER EXITED"; read'
tmux split-window -h -t dev -c "$PWD/client" 'pnpm run dev; echo "CLIENT EXITED"; read'

tmux select-layout -t dev even-horizontal
tmux attach-session -t dev
