# Frontend UI Inspection — versão prompt-only (sem MCP)

Esta versão não depende de Playwright MCP. Funciona em qualquer agente de IA que aceite contexto/prompt, usando prints fornecidos pelo usuário.

## Como usar
1. Copie `SYSTEM_PROMPT.txt` como system prompt/contexto do agente.
2. (Opcional) Anexe `SKILL.md` se o agente suportar mais contexto.
3. Peça a edição: "Edite o botão Entrar na home" e anexe o print (Modo B) ou use ferramentas do agente, se existirem.

## Modo B (prints)
- Salve prints em `/tmp/opencode/ui-<label>.png`.
- Marque o alvo (seta/retângulo) antes de salvar.
- O agente descreve o print e localiza o código por texto/classes.

## Limitações
- Sem navegador automatizado (sem DOM/estilos/console/rede).
- Depende da qualidade do recorte/marcação.

## Conteudo
- `SYSTEM_PROMPT.txt` — prompt curto
- `SKILL.md` — instrução completa (referência)
- `README.skill.md` — explicação simples da skill

## Integração por agente
Veja `agents/agent-integration.md` (Claude Code, Cursor, Codex, chat generico).

## Quando usar esta versão
- Agentes sem suporte a MCP ou sem Playwright.
- Chat web (ChatGPT/Claude.ai/Gemini).
- Qualquer ambiente onde você prefira enviar prints.

---

## Instalar a skill sem clonar o repositório

Baixa apenas os arquivos da skill (sem clonar o repo inteiro).

macOS/Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/SoloLF17/frontend-ui-inspection-prompt-only/main/install/install.sh | bash
```

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/SoloLF17/frontend-ui-inspection-prompt-only/main/install/install.ps1 | iex
```

O instalador grava em `~/.config/opencode/skills/frontend-ui-inspection`.

Variáveis opcionais: `REPO`, `BRANCH`, `SKILL_PATH`, `SKILL_NAME`, `TARGET_BASE`.
