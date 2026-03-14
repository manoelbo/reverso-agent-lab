#!/bin/bash
# Inicia o backend (porta 3210) e o frontend (porta 5173) em paralelo.
# Pressione Ctrl+C para encerrar ambos.

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Encerra todos os processos filhos ao sair
trap "echo ''; echo 'Encerrando...'; kill 0" EXIT

echo "Iniciando Reverso Agent Lab..."
echo "  Backend  → http://localhost:3210"
echo "  Frontend → http://localhost:5173"
echo ""

# Backend
(cd "$ROOT/agent" && pnpm serve) &

# Aguarda um segundo antes de subir o frontend
sleep 1

# Frontend
(cd "$ROOT/agent/interface" && pnpm dev) &

wait
