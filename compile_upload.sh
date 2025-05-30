#!/bin/bash

FILENAME="$1"     # .zip filename from /uploads
MODE="$2"         # compile or upload
LOGFILE="$3"      # full path to output log (currently unused)

UPLOAD_DIR="/home/<serverUser>/server/uploads"
COMPILED_DIR="/home/<serverUser>/server/compiled"
PROJECT_DIR="$COMPILED_DIR/project"
PROS_CMD="/home/<serverUser>/server/.venv/bin/pros"

# mkdir -p "$(dirname "$LOGFILE")"
# touch "$LOGFILE"
# echo "[+] Starting $MODE on $FILENAME" >> "$LOGFILE"

rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"

if ! unzip "$UPLOAD_DIR/$FILENAME" -d "$PROJECT_DIR"; then
    # echo "[!] Unzip failed" >> "$LOGFILE"
    exit 1
fi

PROJECT_DIR=$(find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 -type d | sed 's/\r//' | head -n 1)

if [ ! -d "$PROJECT_DIR" ]; then
        echo "[!] No project directory found inside zip."
        echo "Project directory: $PROJECT_DIR"
        exit 1
fi

cd "$PROJECT_DIR" || exit 1

if [ "$MODE" == "compile" ]; then
    "$PROS_CMD" make
elif [ "$MODE" == "upload" ]; then
    "$PROS_CMD" mu
else
    # echo "[!] Unknown mode: $MODE" >> "$LOGFILE"
    exit 1
fi

# echo "[+] $MODE finished." >> "$LOGFILE"