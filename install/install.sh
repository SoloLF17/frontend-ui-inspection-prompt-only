#!/usr/bin/env bash
# install/install.sh
# Instala a skill "frontend-ui-inspection" baixando APENAS os arquivos da skill
# a partir do GitHub, SEM clonar o repositório inteiro.
#
# Uso (sem clonar o repo):
#   curl -fsSL https://raw.githubusercontent.com/SoloLF17/frontend-ui-inspection-prompt-only/main/install/install.sh | bash
# ou localmente (repo clonado):
#   bash install/install.sh
#
# Variáveis de ambiente (opcionais):
#   REPO=SoloLF17/frontend-ui-inspection-prompt-only
#   BRANCH=main
#   SKILL_PATH=frontend-ui-inspection-prompt-only   (subpasta no repo com os arquivos da skill)
#   SKILL_NAME=frontend-ui-inspection
#   TARGET_BASE=~/.config/opencode/skills
set -euo pipefail

REPO="${REPO:-SoloLF17/frontend-ui-inspection-prompt-only}"
BRANCH="${BRANCH:-main}"
SKILL_PATH="${SKILL_PATH:-frontend-ui-inspection-prompt-only}"
SKILL_NAME="${SKILL_NAME:-frontend-ui-inspection}"
TARGET_BASE="${TARGET_BASE:-$HOME/.config/opencode/skills}"
TARGET="$TARGET_BASE/$SKILL_NAME"

FILES=(
  "README.skill.md"
  "SKILL.md"
  "SYSTEM_PROMPT.txt"
  "agents/agent-integration.md"
)

if ! command -v curl >/dev/null 2>&1; then
  echo "Erro: 'curl' não encontrado. Instale o curl e tente novamente." >&2
  exit 1
fi

BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/${REPO}/${BRANCH}/${SKILL_PATH}}"
echo "Baixando skill '${SKILL_NAME}' de ${REPO}@${BRANCH}/${SKILL_PATH}..."
echo "Fonte: ${BASE_URL}"
echo "Destino: ${TARGET}"

mkdir -p "$TARGET/agents"
for f in "${FILES[@]}"; do
  mkdir -p "$TARGET/$(dirname "$f")"
done

for f in "${FILES[@]}"; do
  url="${BASE_URL}/${f}"
  out="${TARGET}/${f}"
  echo "  -> ${f}"
  if ! curl -fsSL "$url" -o "$out"; then
    echo "Erro ao baixar ${url}" >&2
    exit 1
  fi
done

cat <<EOF

Instalação concluída em: ${TARGET}

Próximos passos:
  1. (OpenCode) Garanta o MCP 'browser' (Playwright) configurado em ~/.config/opencode/opencode.json.
     Trecho de referência: config/opencode.config.snippet.json (no repositório).
  2. Reinicie o agente/OpenCode.
  3. Chame: "Use a skill frontend-ui-inspection para editar o botão Entrar na home."

Não foi baixado o repositório inteiro; apenas os arquivos da skill.
EOF
