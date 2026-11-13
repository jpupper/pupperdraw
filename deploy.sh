#!/bin/bash
# PUPPERDRAW - deploy al VPS (código + front) y restart de PM2
set -e
VPS="root@149.50.139.152"
PUERTO="5752"
DEST="/root/pupperdraw"
cd "$(dirname "$0")"
echo "[1/3] empaquetando (sin node_modules, logs ni data)"
# data/ NO viaja: ahí viven las paletas, presets, config de sala y las imágenes de
# perfil del servidor. Si el tar la pisara, cada deploy borraría el estado guardado.
tar czf /tmp/pupperdraw-deploy.tgz --exclude=node_modules --exclude=logs --exclude=.git --exclude=data .
echo "[2/3] subiendo"
scp -P "$PUERTO" /tmp/pupperdraw-deploy.tgz "$VPS:/root/"
ssh -p "$PUERTO" "$VPS" "tar xzf /root/pupperdraw-deploy.tgz -C $DEST && cd $DEST && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 && pm2 restart pupperdraw"
echo "[3/3] verificando"
curl -s -o /dev/null -w "local VPS  %{http_code}\n" http://127.0.0.1:5124/pupperdraw/ 2>/dev/null || true
curl -s -o /dev/null -w "publico    %{http_code}\n" https://vps-4455523-x.dattaweb.com/pupperdraw/
curl -s https://vps-4455523-x.dattaweb.com/pupperdraw/api/status
echo
