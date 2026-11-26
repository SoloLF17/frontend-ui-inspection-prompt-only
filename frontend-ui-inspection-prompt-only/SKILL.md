---
name: Frontend UI Inspection
description: Inspeciona a UI do frontend para orientar edições de código. Oferece três modos: navegador automatizado (Playwright MCP), print salvo em arquivo, e auditoria UX/UI com end-ui-max. Use ao editar frontend, mapear elemento visual para código, reproduzir bug de layout, revisar acessibilidade/UX/design ou validar alterações.
---

# Frontend UI Inspection — edições assistidas por tela

## Regra de ouro

- **Nunca invente** o que está na tela. Use `browser_snapshot` (DOM/estrutura) como fonte de verdade e screenshot apenas como apoio visual via subagente de visão.
- **Screenshot sozinho não permite ver**: o modelo principal não aceita imagem. Toda captura visual precisa ser descrita por um subagente com modelo de visão (ex.: `opencode/nemotron-3.5-super-vl-free`).
- **Antes de agir** em elemento destrutivo (logout, delete, submit, pagamento), confirme com o usuário.
- **Sempre valide** a alteração: reload + `browser_snapshot` + console/network.

## Ferramentas disponíveis

| Ferramenta | Para quê |
|---|---|
| `tools.browser.browser_navigate` | Abrir URL (localhost ou staging) |
| `tools.browser.browser_snapshot` | Árvore de acessibilidade/HTML (fonte principal) |
| `tools.browser.browser_find` | Buscar texto/regex no snapshot |
| `tools.browser.browser_evaluate` | JS: obter `outerHTML`, classes, estilos computados, bounding boxes |
| `tools.browser.browser_click` / `hover` / `type` | Interação (com `element`/`target` do snapshot) |
| `tools.browser.browser_take_screenshot` | Captura PNG (precisa descrição por subagente de visão) |
| `tools.browser.browser_console_messages` | Erros/warnings do console |
| `tools.browser.browser_network_requests` | Falhas de API, payload |
| `tools.browser.browser_tabs` | Várias abas/estados |
| `tools.browser.browser_resize` | Testar responsividade |
| `scripts/shadow-dom-snapshot.js` (via `browser_evaluate`) | Snapshot/diff em Shadow DOM aberto (web components) |
| `end-ui-max` (`scripts/search.py`) | Auditoria UX/UI, design system, diretrizes por domínio/stack (Modo C) |
| subagent (vision) | Descrever imagens |

## Contexto mínimo a confirmar

1. **URL da app em dev** (ex.: `http://localhost:3000`, `http://localhost:5173`). Se não houver dev server, peça para rodar (`npm run dev`/`pnpm dev`) ou informe staging.
2. **Rota/página** que quer editar.
3. **Elemento alvo**: texto exibido, seletor aproximado ou descrição (“botão ‘Entrar’ no header”).

---

## Modo A — Navegador automatizado (Playwright MCP)

### Fluxo padrão

```js
// 1. abrir
await tools.browser.browser_navigate({ url: "http://localhost:3000/<rota>" });
// 2. snapshot para localizar o alvo
await tools.browser.browser_snapshot({ boxes: true });
// 3. buscar por texto
await tools.browser.browser_find({ text: "Entrar" });
// 4. detalhar elemento (substitua target pelo ref retornado)
await tools.browser.browser_evaluate({
  target: "<ref-do-snapshot>",
  function: "(el) => ({ tag: el.tagName, classes: el.className, html: el.outerHTML, styles: getComputedStyle(el).cssText })"
});
// 5. capturar visual (apoio) + descrever via subagente de visão
await tools.browser.browser_take_screenshot({ fullPage: false, scale: "css", filename: "ui-<label>.png" });
```

### Captura e descrição visual

Como o modelo principal não lê imagem, após o screenshot:

1. Sem `filename`: o Playwright salva em `./.playwright-mcp/page-<timestamp>.png`.
2. Com `filename: "ui-<label>.png"`: salva na raiz do workspace (`./ui-<label>.png`).
3. Se quiser o print no padrão do Modo B (`/tmp/opencode/...`), mova/copie depois (ex.: `cp ./ui-<label>.png /tmp/opencode/ui-<label>.png`).
2. Lance um subagente com modelo de visão:

```js
subagent({
  agent: "general",
  model: "opencode/nemotron-3.5-super-vl-free",
  description: "Descrever screenshot UI",
  prompt: "Leia o arquivo .playwright-mcp/ui-<label>.png e descreva em PT-BR: layout, textos visíveis, cores/formatos dos elementos alvo, possíveis problemas (alinhamento, contraste, truncamento). 8 bullets no máximo."
});
```

3. Compare a descrição com o `browser_snapshot`: ajuste classes/componentes.

### Shadow DOM / Web Components (helper injetável)

Use quando `browser_snapshot` não expuser elementos dentro de **Shadow DOM aberto** (web components). Este helper complementa o snapshot do Playwright; não substitui `browser_snapshot`.

**Quando acionar:**
- O elemento alvo está dentro de um custom element/web component e não aparece no snapshot.
- Você precisa de refs estáveis próprias (`e1`, `e2`, ...) para uma sequência de `browser_evaluate`.
- Você quer um diff estrutural após interação (`added/removed/updated`).

**Instalação (uma vez por página/sessão):**

1. Leia o conteúdo de `scripts/shadow-dom-snapshot.js` (desta skill).
2. Injete na página com `browser_evaluate` (reinjete após navegação/reload).

```js
// Opção A: injete passando o código como argumento (se a ferramenta suportar `arg`/`args`).
await tools.browser.browser_evaluate({
  function: "(source) => { (0, eval)(source); return !!window.__agentSnapshot; }",
  arg: scriptContent
});

// Opção B: injete como corpo da função (substitua <SCRIPT> pelo conteúdo do arquivo).
await tools.browser.browser_evaluate({
  function: "() => { <SCRIPT>; return !!window.__agentSnapshot; }"
});
```

**Uso básico:**

```js
// Snapshot completo (inclui open shadow roots)
await tools.browser.browser_evaluate({ function: "() => window.__agentSnapshot.getFull()" });

// Localizar candidato por texto/role/tag
await tools.browser.browser_evaluate({
  function: "() => window.__agentSnapshot.query({ text: 'Entrar', role: 'button' })"
});

// Iniciar observação e coletar diffs após interação
await tools.browser.browser_evaluate({ function: "() => window.__agentSnapshot.start()" });
await tools.browser.browser_click({ element: "Botão Entrar", ref: "<ref-do-browser_snapshot>" });
await tools.browser.browser_evaluate({ function: "() => window.__agentSnapshot.drainDiffs()" });
```

**API exposta (`window.__agentSnapshot`):**
- `getFull(root?)`: snapshot completo; reseta refs (`e1...`).
- `start(options?)` / `stop()`: observa mutações (inclui novos shadow roots abertos).
- `drainDiffs()` / `getDiffs()`: diffs acumulados `{ added, removed, updated, timestamp }`.
- `forceDiff()`: reavalia elementos interessantes e retorna diff.
- `query({ text?, role?, tag?, inShadow? })`: filtra nós já capturados.
- `getElement(ref)` / `getNode(ref)`: resolve ref para elemento/nó.
- `summary()`: contagem total e em shadow.
- `reset()`: limpa estado e observers.

**Limites:**
- Suporta apenas **Shadow DOM aberto** (`mode: 'open'`). Closed shadow root não é acessível por JS.
- Não atravessa iframes cross-origin; iframes same-origin exigem avaliação no contexto correto.
- `getFull()` pode ser custoso em DOM muito grande; prefira `query()` após snapshot inicial.
- Refs são estáveis durante a sessão de observação; `getFull()`/`reset()` recriam refs.

### Diagnóstico de problemas

- **Console**: `tools.browser.browser_console_messages({ level: "error" })`
- **Rede**: `tools.browser.browser_network_requests({ static: false, filter: "/api" })`
- **Responsividade**: `tools.browser.browser_resize({ width: 390, height: 844 })` + snapshot/screenshot.

### Testar estados

- Tooltips/dropdowns: `browser_hover`/`browser_click` com o ref do snapshot, depois `browser_snapshot` novamente.
- Formulários: `browser_fill_form` / `browser_type` e ver console/rede.
- Login/session: use abas isoladas (`browser_tabs({ action: "new", isolatedContext: "test" })`) para não misturar estado.

### Validação pós-edição

1. Salve o código.
2. `browser_navigate` na rota (ou `browser_navigate_back` se SPA com cache) + aguardar `browser_wait_for({ text: "<texto esperado>" })`.
3. `browser_snapshot` + console (sem erros novos) + network (sem 4xx/5xx novos).
4. Screenshot opcional para confirmação visual (descrever via subagente).

---

## Modo B — Print salvo em arquivo (manual)

Use quando não for possível (ou desejável) automatizar o navegador, ou a página tem proteção/CAPTCHA.

### Convenção de caminho

- Sempre salvar em **`/tmp/opencode/ui-<label>.png`** (ou `.jpg`/`.webp`).
- Se forem vários, adicione timestamp: `ui-header-2026-11-05T15-30-00.png`.
- Para seleção com mouse, circule/marque a região no print (seta/retângulo) antes de salvar; descreva no nome: `ui-header-botao-entrar.png`.
- Evite colar prints dentro do repositório; mantenha em `/tmp/opencode`. Evite arquivos grandes (>5MB).

### Fluxo

1. Usuário tira o print da região e salva no caminho acima.
2. Agente descreve com subagente de visão:

```js
subagent({
  agent: "general",
  model: "opencode/nemotron-3.5-super-vl-free",
  description: "Ler print UI",
  prompt: "Leia /tmp/opencode/ui-<label>.png. Descreva em PT-BR: quais textos/botões aparecem, layout, cores relevantes e qualquer elemento circulado/marcado. Termine com 'ELEMENTO_ALVO: ...' tentando identificar o alvo marcado."
});
```

3. A partir da descrição, localizar no código:
   - `grep` por texto visível, labels, placeholders, classes evidentes.
   - `glob` por componentes em `src/**/*.{tsx,jsx,vue,svelte}`.
4. Se ambíguo, perguntar: qual rota/componente e, se possível, pedir outerHTML do elemento (Inspect → Copy → outerHTML).

### Dicas para aumentar precisão

- Print somente a região (não a página inteira): reduz ruído.
- Inclua 1–2 elementos de referência (header, logo) para eu orientar.
- Se puder, use DevTools → “Copy selector” ou “Copy outerHTML” e cole junto; isso elimina ambiguidade.
- Marque com retângulo vermelho o alvo antes do print.

---

## Modo C — Inspeção + Auditoria UX/UI (companion: `end-ui-max`)

Use quando o pedido for além de "onde está no código": revisar UX/UI, acessibilidade, hierarquia visual, consistência, ou sugerir melhorias de design com evidência.

### Quando usar

- "Revise a UX dessa tela", "melhore o design desse componente", "está acessível?".
- Após Modo A/B, quando você já tem evidência visual/estrutural e quer recomendações fundamentadas.
- Antes de refatorar UI: gerar direção de design (`--design-system`) ou buscar guideline específica.

### Pré-requisitos

- Skill `end-ui-max` disponível: empacotada em `end-ui-max/` (dentro desta skill) ou instalada globalmente em `~/.opencode/skills/end-ui-max/`.
- Python 3 para o CLI: `python3 --version` (ou `python --version` no Windows). Se não houver Python, use as referências da skill carregada via `skill({ id: "end-ui-max" })`.
- Evidência da UI: snapshot/screenshot/shadow helper (Modo A) ou print descrito (Modo B). **Não audite sem evidência.**

### Fluxo

1. **Coletar evidência** (Modo A ou B): `browser_snapshot`, screenshot descrito por visão, `browser_console_messages`, e/ou `window.__agentSnapshot.getFull()` para web components.
2. **Definir o escopo da auditoria:** 1 intenção por busca (ex.: foco em modal, contraste, validação de formulário, hierarquia de navegação). Não misture checklist inteiro em uma query.
3. **Consultar end-ui-max:**

```bash
# Defina o caminho do end-ui-max (empacotado nesta skill ou global)
END_UI_MAX="end-ui-max"  # ou: ~/.opencode/skills/end-ui-max

# Guideline UX específica (web)
python3 "$END_UI_MAX/scripts/search.py" "form validation error summary" --domain ux

# Stack/implementação (quando o stack for conhecido)
python3 "$END_UI_MAX/scripts/search.py" "focus visible modal" --stack html-tailwind

# Direção visual para redesign/página nova
python3 "$END_UI_MAX/scripts/search.py" "saas dashboard analytics" --design-system -p "Meu Projeto"
```

4. **Filtrar por plataforma:** as regras/checklists do end-ui-max marcadas como "App UI (iOS/Android/RN/Flutter)" **não** se aplicam cegamente a web desktop. Para web, prefira domínios `ux`, `style`, `color`, `typography`, `landing`, `chart`, `icons` e stacks web (`html-tailwind`, `react`, `nextjs`, `vue`, `shadcn` etc.). Use regras mobile apenas quando o alvo for realmente mobile/native.
5. **Mapear achado para código:** use o fluxo de "Mapeamento elemento → código" para apontar arquivo/linha candidato.
6. **Reportar com evidência.** Se a busca não retornar match verificado, declare explicitamente e rotule qualquer orientação geral.

### Template de relatório (Modo C)

```markdown
## Auditoria UX/UI — <página/componente>

**Evidência:** <snapshot/screenshot/shadow summary/console>
**Stack/plataforma:** <ex.: Next.js web desktop/mobile>

### Achados
1. **Achado:** <problema observado>
   - **Evidência:** <o que foi visto no snapshot/print/DOM>
   - **Regra/Guideline:** <resultado end-ui-max: domínio, query, recomendação; ou "sem match verificado">
   - **Arquivo/linha candidato:** `path:line` — <trecho>
   - **Correção sugerida:** <mudança concreta>
   - **Risco:** baixo/médio/alto — <motivo>
```

### Guardrails

- **Evidência primeiro:** não faça auditoria "de cabeça".
- **1 intenção por query:** busque um problema observável por vez.
- **Verificar antes de usar:** confirme que o resultado do end-ui-max se aplica ao produto/plataforma.
- **Sem match verificado:** diga claramente; não apresente palpite como resultado da base.
- **Não extrapolar mobile para web:** safe areas, 44pt/48dp, Dynamic Type etc. só quando o alvo for mobile/native.
- **Sem mudanças destrutivas sem confirmação.**

---

## Mapeamento elemento → código

Quando houver descrição ou texto, siga esta ordem:

1. **Texto visível** → `grep` literal (case-insensitive) no repo de frontend.
2. **Seletor/classe** → grep por classe (ex.: `.btn-primary`, `data-testid`).
3. **Componente** → abra o arquivo e inspecione props/estrutura com `read`; não assuma.
4. **Se múltiplos matches**, mostre os candidatos e peça confirmação antes de editar.
5. **Reporte**: arquivo, linha (aproximada se não exata), trecho e motivo da mudança.

### Template de saída sugerida

```markdown
**Alvo visual:** <descrição>
**Candidatos de código:**
- `src/components/Header.tsx:42-58` — botão "Entrar" com classes `btn btn-primary`
- `src/styles/header.css:12` — cor do botão
**Mudança proposta:** <diff resumido>
**Risco:** <baixo/médio/alto> — <motivo>
```

## Limitações conhecidas

- O browser é lançado em instância separada; **não controla sua sessão/desktop atual** (cookies/logins do seu Chrome não são compartilhados, salvo se configurar user-data-dir).
- O modelo principal não vê imagens: toda verificação visual exige subagente de visão.
- DevTools do browser no Playwright MCP não existem; use `browser_evaluate` para `outerHTML`/estilos.
- Se a app exigir autenticação, forneça URL já autenticada, credenciais de teste (nunca produção) ou cookie manual via `browser_evaluate`/headers.
- Screenshots grandes podem falhar; use região/viewport.
- Web components/Shadow DOM: `browser_snapshot` pode não expor o conteúdo esperado. Para **Shadow DOM aberto**, injete `scripts/shadow-dom-snapshot.js`; **closed shadow root** não é acessível via JS. Iframes cross-origin também não são atravessáveis.

## Permissões / configuração

Em `~/.config/opencode/opencode.json`:

- `browser_*`: allow (já configurado).
- Playwright MCP adicionado como servidor `browser`.
- Se aparecer prompt “permission denied”, adicione `{ "action": "browser_*", "resource": "*", "effect": "allow" }`.

## Teste rápido (checklist)

- [ ] `opencode mcp list` mostra `browser` (pode estar pending até primeira chamada).
- [ ] `browser_navigate` abre uma URL pública e `browser_snapshot` retorna árvore.
- [ ] `browser_take_screenshot` salva PNG em `.playwright-mcp/`.
- [ ] Subagente `opencode/nemotron-3.5-super-vl-free` descreve o PNG corretamente.
- [ ] Para print manual: salvar em `/tmp/opencode/ui-test.png` e o subagente descreve.
- [ ] `browser_console_messages({ level: "error" })` retorna sem crash.
- [ ] `scripts/shadow-dom-snapshot.js` injeta via `browser_evaluate` e `window.__agentSnapshot.getFull()` retorna nós (em página com Shadow DOM aberto).
- [ ] (Modo C) `python3 end-ui-max/scripts/search.py "form validation" --domain ux` retorna resultados (empacotado nesta skill; ou caminho global equivalente).

## Comparação rápida dos modos

| Critério | Modo A (browser) | Modo B (print) | Modo C (auditoria UX/UI) |
|---|---|---|---|
| Velocidade | Média (navegação + snapshot) | Rápida (você captura) | Média/Alta (inspeção + buscas) |
| Precisão técnica | Alta (DOM, estilos, console, rede) | Média (depende do recorte) | Alta quando baseada em evidência |
| Estados/interações | Sim (click/hover/form) | Não | Depende do Modo A/B usado como base |
| Dependência de dev server | Sim | Não | Não (mas Modo A ajuda) |
| Privacidade/produção | Use staging | Pode usar produção (sem dados sensíveis) | Mesmas regras da evidência usada |

Recomendação: **Modo A** para desenvolvimento local iterativo; **Modo B** para reportar bug em produção/staging sem automação; **Modo C** quando precisar avaliar/melhorar UX, acessibilidade ou design com recomendações fundamentadas.
