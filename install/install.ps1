# install/install.ps1
# Instala a skill "frontend-ui-inspection" baixando APENAS os arquivos da skill
# a partir do GitHub, SEM clonar o repositório inteiro (Windows/PowerShell).
#
# Uso (sem clonar o repo):
#   irm https://raw.githubusercontent.com/SoloLF17/frontend-ui-inspection-prompt-only/main/install/install.ps1 | iex
# ou localmente (repo clonado):
#   powershell -ExecutionPolicy Bypass -File install/install.ps1
#
# Variáveis (opcionais):
#   $env:REPO, $env:BRANCH, $env:SKILL_PATH, $env:SKILL_NAME, $env:TARGET_BASE

$ErrorActionPreference = "Stop"

$Repo    = if ($env:REPO)    { $env:REPO }    else { "SoloLF17/frontend-ui-inspection-prompt-only" }
$Branch  = if ($env:BRANCH)  { $env:BRANCH }  else { "main" }
$SkillPath= if ($env:SKILL_PATH){ $env:SKILL_PATH } else { "frontend-ui-inspection-prompt-only" }
$SkillName= if ($env:SKILL_NAME){ $env:SKILL_NAME } else { "frontend-ui-inspection" }
$TargetBase = if ($env:TARGET_BASE) { $env:TARGET_BASE } else { Join-Path $HOME ".config\opencode\skills" }
$Target = Join-Path $TargetBase $SkillName

$Files = @(
  "README.skill.md",
  "SKILL.md",
  "SYSTEM_PROMPT.txt",
  "agents/agent-integration.md"
)

if ($env:BASE_URL) { $BaseUrl = $env:BASE_URL } else { $BaseUrl = "https://raw.githubusercontent.com/$Repo/$Branch/$SkillPath" }
Write-Host "Baixando skill '$SkillName' de $Repo@$Branch/$SkillPath..."
Write-Host "Fonte: $BaseUrl"
Write-Host "Destino: $Target"

New-Item -ItemType Directory -Force -Path (Join-Path $Target "agents") | Out-Null
foreach ($f in $Files) {
  $dir = Split-Path (Join-Path $Target $f) -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

foreach ($f in $Files) {
  $url = "$BaseUrl/$f"
  $out = Join-Path $Target $f
  Write-Host "  -> $f"
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
}

Write-Host ""
Write-Host "Instalacao concluida em: $Target"
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "  1. (OpenCode) Garanta o MCP 'browser' (Playwright) configurado em ~/.config/opencode/opencode.json."
Write-Host "     Trecho de referencia: config/opencode.config.snippet.json (no repositorio)."
Write-Host "  2. Reinicie o agente/OpenCode."
Write-Host "  3. Chame: `"Use a skill frontend-ui-inspection para editar o botao Entrar na home.`""
Write-Host ""
Write-Host "Nao foi baixado o repositorio inteiro; apenas os arquivos da skill."