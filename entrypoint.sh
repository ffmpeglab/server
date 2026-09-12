#!/bin/sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export FFMPEG_PATH="$(which ffmpeg)"
export BWRAP_PATH="$(which bwrap)"
mount -t proc proc /mnt
mount -o remount,rw /proc/sys
node dist/main.js