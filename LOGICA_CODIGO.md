# Detalhamento Lógico do Código - Apoio RNEST

Este documento descreve detalhadamente a lógica de funcionamento, algoritmos, fluxos e manipulação de estado implementados no código JavaScript (`app.js`, `data.js`, `firebase-db.js`) da aplicação **Apoio RNEST**.

---

## 📁 1. Estruturas de Dados (Modelos)

O estado da aplicação é mantido em memória através de variáveis globais reativas sincronizadas com o Firebase Firestore (ou LocalStorage em modo offline).

### A. Usuários (`users`)
Representa cada colaborador cadastrado no sistema.
```json
{
  "id": "AB2U",
  "nome": "Syan Addy Vasconcellos",
  "email": "syanaddy76@gmail.com",
  "tipo": "OPERADOR", 
  "cargo": "Operador",
  "infracoesWA": 0
}
```
*   `tipo`: Nível de permissão no sistema (`OPERADOR`, `SUPERVISOR`, `GERENTE`, `ADMINISTRADOR`).
*   `cargo`: Cargo funcional. Se for `GPI` ou `OPMAN`, o usuário é excluído dos cálculos de prioridade.
*   `infracoesWA`: Contador de multas do WhatsApp (Art. 7º). Adiciona `0.01` por infração na pontuação geral.

### B. Regras de Apoio (`SUPPORT_RULES`)
Constantes contendo as características dos apoios e seus respectivos pesos (Art. 4º).
```json
{
  "id": "R1",
  "descricao": "TURNO - Carga Horária Doze Horas",
  "peso": 10
}
```

### C. Escalas de Trabalho / Vagas (`slots`)
Representa cada vaga de apoio solicitada pela administração.
```json
{
  "id": "s_1717590000000",
  "data": "2026-06-05",
  "subgrupo": "Painel Térmico",
  "horario": "07h às 19h",
  "status": "LIVRE",
  "usuarioId": null,
  "regrasPrevistas": ["R1", "R5"],
  "requerAutorizacao": false,
  "autorizadoPorId": null
}
```
*   `status`: Estado da vaga (`LIVRE` - disponível, `EM_DISPUTA` - janela de prioridade ativa, `ATRIBUIDO` - confirmada para um colaborador).
*   `regrasPrevistas`: Características planejadas para o apoio, usadas para simular/estimar os pontos.
*   `requerAutorizacao`: Define se o apoio requer aprovação por exceder o limite mensal de 3 apoios.

### D. Histórico de Lançamentos (`history`)
Registros de apoios efetuados. É a base para a pontuação do ranking de prioridades.
```json
{
  "id": "h_1717595000000",
  "usuarioId": "AB2U",
  "data": "2026-06-05",
  "subgrupo": "Painel Térmico",
  "regras": ["R1", "R5"],
  "pontuacao": 0.7,
  "dataRegistro": "2026-06-05T12:00:00.000Z",
  "registradoPorId": "AB2U"
}
```

### E. Candidatos a Vagas em Disputa (`candidatos`)
Mapa chave-valor que armazena a fila de prioridades para vagas em disputa.
*   **Chave**: `slotId` da vaga.
*   **Valor**: Array de IDs dos candidatos cadastrados (ex: `['AB5A', 'KBVX']`).

---

## 🧮 2. Lógica de Cálculos e Algoritmos de Prioridade

Os cálculos são realizados dinamicamente para garantir a prioridade com base nas regras do Projeto de Lei Nº 0001/2025.

### A. Pontuação de um Apoio Individual (`calculateSupportScore`)
Calcula a pontuação multiplicando os pesos das regras aplicadas e dividindo por 10.
```javascript
function calculateSupportScore(regrasArray) {
  if (!regrasArray || regrasArray.length === 0) return 0;
  
  // Fórmula: Pontuação = Produtório (Peso / 10)
  const product = regrasArray.reduce((acc, ruleId) => {
    const rule = SUPPORT_RULES.find(r => r.id === ruleId);
    const peso = rule ? rule.peso : 10;
    return acc * (peso / 10);
  }, 1.0);

  return parseFloat(product.toFixed(4));
}
```
*   *Apoios mais pesados resultam em pontuações menores*, o que ajuda o colaborador a manter uma pontuação geral mais baixa e, consequentemente, maior prioridade no ranking.
*   *Penalidade R13 (Fora do Prazo)*: Se o lançamento for registrado mais de 72 horas após a realização, a regra é forçada para `['R13']` (peso 20), resultando em uma pontuação de **2.0** (multa).

### B. Classificação Geral Acumulada (`calculateUserPointsGeral`)
Soma todos os apoios válidos do colaborador no ano corrente e aplica as multas do WhatsApp.
$$\text{Pontuação Geral} = \sum (\text{Pontuação dos Apoios}) + (\text{InfracoesWA} \times 0.01)$$
```javascript
function calculateUserPointsGeral(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return 999.0;

  // Exclui cargos que não participam do ranking (Art. 6º)
  const isExcluido = user.cargo === 'GPI' || user.cargo === 'OPMAN';
  if (isExcluido) return 999.0; 

  const userHistory = history.filter(h => h.usuarioId === userId);
  let sum = userHistory.reduce((acc, h) => acc + h.pontuacao, 0.0);
  
  if (user.infracoesWA) {
    sum += user.infracoesWA * 0.01;
  }

  return parseFloat(sum.toFixed(4));
}
```

### C. Desempate do Ranking (`getDisputeWinner`)
Resolve o vencedor de uma vaga em disputa seguindo a ordem de prioridades do Art. 8º.
1.  **Menor Pontuação Geral**: Quem tiver menos pontos acumulados tem maior prioridade.
2.  **Último Apoio Mais Antigo**: Havendo empate nos pontos, quem realizou o último apoio há mais tempo tem preferência.
3.  **Fila de Inscrição**: Caso o empate persista, a ordem de inscrição na fila serve de desempate.
```javascript
function getDisputeWinner(slotId) {
  const candIds = candidatos[slotId] || [];
  if (candIds.length === 0) return null;

  const candidatesList = candIds.map((uid, index) => {
    const u = users.find(user => user.id === uid);
    const score = calculateUserPointsGeral(uid);
    const lastDate = getUserLastSupportDate(uid); // Retorna "YYYY-MM-DD" ou "1970-01-01" se nenhum
    return { id: uid, nome: u?.nome || 'Desconhecido', score, lastDate, index };
  });

  // Ordenação crescente
  candidatesList.sort((a, b) => {
    // 1. Menor pontuação
    if (a.score !== b.score) return a.score - b.score;
    // 2. Último apoio mais antigo (comparação de strings de data)
    if (a.lastDate !== b.lastDate) {
      return a.lastDate < b.lastDate ? -1 : 1;
    }
    // 3. Ordem de inscrição (index)
    return a.index - b.index;
  });

  return candidatesList[0]; // Retorna o vencedor com maior prioridade
}
```

---

## 🚦 3. Fluxo de Atribuição de Vagas e Bumping (Substituição)

O fluxo do sistema garante o direito de preferência a qualquer momento.

### A. Substituição por Prioridade (Bumping)
Se uma vaga direta estiver ocupada por um voluntário (com status `ATRIBUIDO`), outro colaborador com **maior prioridade** (menor pontuação geral) pode clicar em **"Substituir"** e assumir a vaga.
```javascript
function handleSubstituirVaga(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const oldAssigneeId = slot.usuarioId;
  const oldUser = users.find(u => u.id === oldAssigneeId);

  // 1. Remove o registro do antigo ocupante no histórico
  const indexToRemove = history.findIndex(h => h.usuarioId === oldAssigneeId && h.data === slot.data);
  if (indexToRemove !== -1) {
    history.splice(indexToRemove, 1);
  }

  // 2. Verifica o limite mensal do novo ocupante
  const monthlyCount = getUserMonthlySupportCount(currentUser.id, slot.data);
  const needsAuthorization = monthlyCount >= 3;

  // 3. Reatribui o slot
  slot.usuarioId = currentUser.id;
  if (needsAuthorization) {
    slot.requerAutorizacao = true;
  } else {
    delete slot.requerAutorizacao;
  }

  // 4. Insere o novo registro correspondente no histórico
  const historyId = 'h_' + Date.now();
  const regras = slot.regrasPrevistas || ['R1'];
  
  // Força penalidade R13 caso o apoio esteja atrasado > 72h
  const supportDate = new Date(slot.data + 'T00:00:00');
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
  const eAtrasado = (simDate - supportDate) > (3 * 24 * 60 * 60 * 1000);
  const finalRegras = eAtrasado ? ['R13'] : regras;
  const score = calculateSupportScore(finalRegras);

  const novoHistorico = {
    id: historyId,
    usuarioId: currentUser.id,
    data: slot.data,
    subgrupo: slot.subgrupo,
    regras: finalRegras,
    pontuacao: score,
    dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
    registradoPorId: currentUser.id
  };

  history.push(novoHistorico);
  persistChanges();
}
```

### B. Desistência de Vaga
Quando o colaborador clica em desistir, a vaga é limpa e o registro do histórico é excluído.
```javascript
function handleDesistirVaga(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const assigneeId = slot.usuarioId;

  // 1. Remove do histórico
  const indexToRemove = history.findIndex(h => h.usuarioId === assigneeId && h.data === slot.data);
  if (indexToRemove !== -1) {
    history.splice(indexToRemove, 1);
  }

  // 2. Libera a escala
  slot.usuarioId = null;
  slot.status = 'LIVRE';
  delete slot.requerAutorizacao;
  delete slot.autorizadoPorId;

  persistChanges();
}
```

---

## 🔒 4. Lógica de Limite Mensal e Aprovações Gerenciais

Esta regra garante que nenhum operador acumule apoios em excesso no mês sem a autorização explícita de um gestor.

### A. Validação de Limite
A verificação ocorre em três momentos:
1.  **Ao assumir diretamente** (`handleAssumirVagaDireta`).
2.  **Ao substituir alguém** (`handleSubstituirVaga`).
3.  **Ao encerrar uma disputa** (`handleEncerrarDisputa`).

Se o usuário já possuir **3 ou mais apoios** no mês da escala, a propriedade `requerAutorizacao = true` é setada na escala.

### B. Aprovação e Rejeição (Supervisor / Gerente / Administrador)
*   **Autorizar (`handleAutorizarApoio`)**: Limpa `requerAutorizacao` e define `autorizadoPorId` com a chave do gestor ativo. O lançamento no histórico permanece válido.
*   **Rejeitar (`handleRejeitarAutorizacao`)**: Remove o lançamento correspondente do histórico, limpa o `usuarioId` da vaga, retorna o status da escala para `LIVRE` e apaga as propriedades de autorização.

---

## 🔍 5. Lógica da Tabela de Auditoria de Lançamentos

A aba de auditoria cruza os apoios que foram escalados e confirmados no painel de vagas com os lançamentos efetuados pelos operadores na aba de históricos.

```javascript
function renderAuditoriaTable() {
  const tableBody = document.getElementById('auditoria-table-body');
  if (!tableBody) return;

  // Filtra apenas escalas que foram ocupadas (status ATRIBUIDO)
  const assignedSlots = slots.filter(s => s.status === 'ATRIBUIDO' && s.usuarioId);

  let html = '';
  assignedSlots.forEach(slot => {
    // 1. Procura registro no histórico correspondente (mesmo usuário na mesma data do apoio)
    const match = history.find(h => h.usuarioId === slot.usuarioId && h.data === slot.data);
    const hasLaunched = !!match;

    // 2. Aplica filtros da UI (Filtro por Usuário, Status de Lançamento e Datas)
    // ... lógica de filtragem ...

    // 3. Renderiza a linha na tabela
    html += `
      <tr>
        <td>${formatDatePt(slot.data)}</td>
        <td>${slot.subgrupo}</td>
        <td>${slot.horario}</td>
        <td>${getUserName(slot.usuarioId)}</td>
        <td>${match ? getUserName(match.registradoPorId) : '-'}</td>
        <td>${match ? `ID: ${match.id}` : 'Pendente'}</td>
        <td>
          <span class="badge ${hasLaunched ? 'badge-open' : 'badge-danger'}">
            ${hasLaunched ? 'Lançado ✓' : 'Não Lançado ⚠️'}
          </span>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
}
```

---

## ⚡ 6. Lógica de Sincronização Dinâmica do Firebase

A sincronização de dados funciona com carregamento assíncrono em duas etapas para evitar resets e erros de sessão.

### A. Login e Inicialização dos Ouvintes
1.  **Google Login**: O usuário clica em `btn-google-login`, chamando `loginWithGoogle()`.
2.  **Detecção de Sessão**: O método `onAuthChange` detecta a sessão ativa do usuário e chama `setupRealtimeSync()`.
3.  **Remoção de Conexões Antigas**: `setupRealtimeSync` cancela qualquer ouvinte anterior para evitar duplicações (`unsubscribers.forEach(unsub => unsub())`).

### B. Ciclo de Vida do Sincronismo (`syncDocument` / `updateDocument`)
*   **Firestore Ativado**:
    *   `syncDocument(docName, defaultData, callback)` inicia uma escuta ativa (`onSnapshot`) no documento correspondente no Firestore. Sempre que o banco de dados nuvem é alterado (seja por este usuário ou por outro), o `callback` é executado com os novos dados, atualizando a memória local (`users`, `slots`, `history`, etc.) e executando `renderAll()`.
    *   `updateDocument(docName, data)` envia a nova coleção inteira em lote usando `setDoc` para o Firestore, disparando a atualização em tempo real para os outros clientes conectados.
*   **Modo Local (Offline)**:
    *   `syncDocument` tenta ler do `localStorage`. Se não existir, semeia com os valores padrões (`INITIAL_*`) e chama o callback imediatamente.
    *   `updateDocument` salva a coleção serializada no `localStorage` usando `JSON.stringify()`.
