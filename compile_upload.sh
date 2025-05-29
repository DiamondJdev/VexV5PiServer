#!/bin/bash
FILENAME=$1         # e.g. main.cpp
MODE=$2             # compile or upload
LOGFILE=$3          # output log path

PROJ_DIR="/home/<username>/vex_project"
SRC_FILE="$PROJ_DIR/src/main.cpp"

echo "[+] Starting $MODE on $FILENAME" > "$LOGFILE"

# Prepare project
rm -rf "$PROJ_DIR"
pros conduct new-project "$PROJ_DIR" -l none --force &>> "$LOGFILE"
cp "uploads/$FILENAME" "$SRC_FILE" &>> "$LOGFILE"

cd "$PROJ_DIR" || exit 1

if [ "$MODE" == "compile" ]; then
    pros make &>> "$LOGFILE"
elif [ "$MODE" == "upload" ]; then
    pros upload &>> "$LOGFILE"
else
    echo "Unknown mode: $MODE" >> "$LOGFILE"
    exit 1
fi

echo "[+] $MODE finished." >> "$LOGFILE"
