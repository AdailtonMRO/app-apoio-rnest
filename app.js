import { getStoredData, saveStoredData, SUPPORT_RULES } from './data.js';

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let users = [];
let groups = [];
let slots = [];
let history = [];

// Perfil simulado ativo
let currentUserId = 'u1'; // Syan Addi por padrão
let currentUser = null;

// Abas de visualização principal e escalas
let currentView = 'escalas'; // 'escalas', 'registro', 'historico'
let activeTab = 'all';

// Data simulada atual (para testes da regra de 72h)
let simulatedCurrentDate = '2026-06-04';

// Candidaturas a vagas em disputa
// { slotId: [userId1, userId2] }
let candidatos = {
  's_f1': ['u13', 'u4'], // Alan (6.0), George (1.7)
  's_f2': ['u7'],        // Adailton (2.21)
  's_f3': ['u2', 'u3']   // Javã (0.8, último 15/05), Max (0.8, último 10/05)
};

// --- ELEMENTOS DO DOM ---
const roleSelect = document.getElementById('role-select');
const btnResetDemo = document.getElementById('btn-reset-demo');
const simCurrentDateInput = document.getElementById('sim-current-date');
const tabContainer = document.getElementById('tab-container');
const slotsCount = document.getElementById('slots-count');
const slotsGrid = document.getElementById('slots-grid');
const myPanelWidget = document.getElementById('my-panel-widget');
const rankingTableBody = document.getElementById('ranking-table-body');
const notificationContainer = document.getElementById('notification-container');
const adminActionsBar = document.getElementById('admin-actions-bar');

// Abas da Visualização Principal
const tabBtnEscalas = document.getElementById('tab-btn-escalas');
const tabBtnRegistro = document.getElementById('tab-btn-registro');
const tabBtnHistorico = document.getElementById('tab-btn-historico');
const viewEscalas = document.getElementById('view-escalas');
const viewRegistro = document.getElementById('view-registro');
const viewHistorico = document.getElementById('view-historico');

// Modais
const addModal = document.getElementById('add-modal');
const btnOpenAddModal = document.getElementById('btn-open-add-modal');
const btnCloseAddModal = document.getElementById('btn-close-add-modal');
const btnCancelAddModal = document.getElementById('btn-cancel-add-modal');
const addSlotForm = document.getElementById('add-slot-form');
const modalRulesCheckboxes = document.getElementById('modal-rules-checkboxes');

const whatsappModal = document.getElementById('whatsapp-modal');
const btnOpenWhatsappModal = document.getElementById('btn-open-whatsapp-modal');
const btnCloseWhatsappModal = document.getElementById('btn-close-whatsapp-modal');
const btnCancelWhatsappModal = document.getElementById('btn-cancel-whatsapp-modal');
const whatsappExportArea = document.getElementById('whatsapp-export-area');
const btnCopyWhatsapp = document.getElementById('btn-copy-whatsapp');

const infracaoModal = document.getElementById('infracao-modal');
const btnOpenInfracaoModal = document.getElementById('btn-open-infracao-modal');
const btnCloseInfracaoModal = document.getElementById('btn-close-infracao-modal');
const btnCancelInfracaoModal = document.getElementById('btn-cancel-infracao-modal');
const infracaoForm = document.getElementById('infracao-form');

// Formulário de Auto-Registro
const regUsuarioSelect = document.getElementById('reg-usuario');
const regSubgrupoInput = document.getElementById('reg-subgrupo');
const regDataInput = document.getElementById('reg-data');
const regDataLancamentoInput = document.getElementById('reg-data-lancamento');
const regDateWarning = document.getElementById('reg-date-warning');
const rulesCheckboxContainer = document.getElementById('rules-checkbox-container');
const regPointsPreview = document.getElementById('reg-points-preview');
const regFormulaPreview = document.getElementById('reg-formula-preview');
const registerCompletedSupportForm = document.getElementById('register-completed-support-form');

// --- INICIALIZAÇÃO ---
function init() {
  loadData();

  // Configurar data de hoje simulada
  simCurrentDateInput.value = simulatedCurrentDate;
  regDataLancamentoInput.value = formatDatePt(simulatedCurrentDate);

  // Listeners de navegação principal
  tabBtnEscalas.addEventListener('click', () => switchView('escalas'));
  tabBtnRegistro.addEventListener('click', () => switchView('registro'));
  tabBtnHistorico.addEventListener('click', () => switchView('historico'));

  // Listeners de simulação
  roleSelect.addEventListener('change', handleRoleChange);
  btnResetDemo.addEventListener('click', resetDemo);
  simCurrentDateInput.addEventListener('change', handleSimDateChange);

  // Modais - Adicionar
  btnOpenAddModal.addEventListener('click', () => addModal.style.display = 'flex');
  btnCloseAddModal.addEventListener('click', () => addModal.style.display = 'none');
  btnCancelAddModal.addEventListener('click', () => addModal.style.display = 'none');
  addSlotForm.addEventListener('submit', handleCriarSolicitacaoSlot);

  // Modais - WhatsApp
  btnOpenWhatsappModal.addEventListener('click', openWhatsappExporter);
  btnCloseWhatsappModal.addEventListener('click', () => whatsappModal.style.display = 'none');
  btnCancelWhatsappModal.addEventListener('click', () => whatsappModal.style.display = 'none');
  btnCopyWhatsapp.addEventListener('click', handleCopyClipboard);

  // Modais - Infração WhatsApp
  btnOpenInfracaoModal.addEventListener('click', () => infracaoModal.style.display = 'flex');
  btnCloseInfracaoModal.addEventListener('click', () => infracaoModal.style.display = 'none');
  btnCancelInfracaoModal.addEventListener('click', () => infracaoModal.style.display = 'none');
  infracaoForm.addEventListener('submit', handleAplicarInfracao);

  // Formulário de Auto-Registro - Eventos
  regDataInput.addEventListener('change', checkLateSubmission);
  registerCompletedSupportForm.addEventListener('submit', handleAutoRegistroApoio);

  // Preencher elementos de formulário
  renderFormGroupsOptions();
  renderRulesCheckboxes();

  // Fechar modais ao clicar fora
  window.addEventListener('click', (e) => {
    if (e.target === addModal) addModal.style.display = 'none';
    if (e.target === whatsappModal) whatsappModal.style.display = 'none';
    if (e.target === infracaoModal) infracaoModal.style.display = 'none';
  });

  // Render inicial
  renderAll();
}

function loadData() {
  const data = getStoredData();
  users = data.users;
  groups = data.groups;
  slots = data.slots;
  history = data.history;

  currentUser = users.find(u => u.id === currentUserId) || users[0];
  currentUserId = currentUser.id;
}

function persistChanges() {
  saveStoredData({ users, groups, slots, history });
  renderAll();
}

function switchView(view) {
  currentView = view;
  
  // Atualizar abas
  tabBtnEscalas.classList.toggle('active', view === 'escalas');
  tabBtnRegistro.classList.toggle('active', view === 'registro');
  tabBtnHistorico.classList.toggle('active', view === 'historico');

  // Atualizar contêineres
  viewEscalas.style.display = view === 'escalas' ? 'block' : 'none';
  viewRegistro.style.display = view === 'registro' ? 'block' : 'none';
  viewHistorico.style.display = view === 'historico' ? 'block' : 'none';

  if (view === 'registro') {
    // Configurar o usuário atual selecionado no formulário
    regUsuarioSelect.value = currentUser.tipo === 'APOIADOR' ? currentUser.id : users.filter(u => u.tipo === 'APOIADOR')[0].id;
    updatePointsPreview();
  }

  if (view === 'historico') {
    renderHistoryTable();
  }
}

// --- CONTROLE DE MUDANÇA DE CONFIGURAÇÃO SIMULADA ---

function handleRoleChange(e) {
  currentUserId = e.target.value;
  currentUser = users.find(u => u.id === currentUserId);
  renderAll();
  
  // Se mudar para admin na aba de registros, move para escalas
  if (currentUser.tipo !== 'APOIADOR' && currentView === 'registro') {
    switchView('escalas');
  }
}

function handleSimDateChange(e) {
  simulatedCurrentDate = e.target.value;
  regDataLancamentoInput.value = formatDatePt(simulatedCurrentDate);
  checkLateSubmission();
  showBanner(`Data simulada alterada para: ${formatDatePt(simulatedCurrentDate)}`, 'info');
  renderAll();
}

function resetDemo() {
  localStorage.removeItem('rnest_law_users');
  localStorage.removeItem('rnest_law_groups');
  localStorage.removeItem('rnest_law_slots');
  localStorage.removeItem('rnest_law_history');

  candidatos = {
    's_f1': ['u13', 'u4'],
    's_f2': ['u7'],
    's_f3': ['u2', 'u3']
  };

  currentUserId = 'u1';
  simulatedCurrentDate = '2026-06-04';
  simCurrentDateInput.value = simulatedCurrentDate;
  regDataLancamentoInput.value = formatDatePt(simulatedCurrentDate);

  loadData();
  renderAll();
  showBanner('Simulação e histórico resetados!', 'info');
}

// --- CÁLCULOS DA LEI DE APOIO (FÓRMULAS OFICIAIS) ---

// 1. Calcula a pontuação individual de um apoio: Produto de (Peso / 10)
function calculateSupportScore(regrasArray) {
  if (regrasArray.length === 0) return 0.0;
  
  let prod = 1.0;
  regrasArray.forEach(rid => {
    const rule = SUPPORT_RULES.find(r => r.id === rid);
    if (rule) {
      prod *= (rule.peso / 10);
    }
  });
  
  return parseFloat(prod.toFixed(4));
}

// 2. Calcula a data do último apoio feito por um usuário (para desempate do Art. 8º)
function getUserLastSupportDate(userId) {
  const userHistory = history.filter(h => h.usuarioId === userId);
  if (userHistory.length === 0) return null;
  
  // Ordenar por data decrescente
  userHistory.sort((a, b) => new Date(b.data) - new Date(a.data));
  return userHistory[0].data;
}

// 3. Calcula a pontuação acumulada total do colaborador (Geral = Σ apoios + (infrações * 0.01))
function calculateUserPointsGeral(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return 0.0;

  // Se for GPI/OPMAN e não classificado
  if (user.cargo === 'GPI' || user.cargo === 'OPMAN') {
    return 0.0; // Não entram na classificação geral (Art. 6º)
  }

  const userHistory = history.filter(h => h.usuarioId === userId);
  let sum = userHistory.reduce((acc, h) => acc + h.pontuacao, 0.0);
  
  // Adicionar multas WhatsApp (+0.01 por infração - Art. 7º)
  if (user.infracoesWA) {
    sum += user.infracoesWA * 0.01;
  }

  return parseFloat(sum.toFixed(4));
}

// 4. Lógica de desempate e ranking de candidatos para uma vaga
function getDisputeWinner(slotId) {
  const candIds = candidatos[slotId] || [];
  if (candIds.length === 0) return null;

  const candidatesList = candIds.map((uid, index) => {
    const u = users.find(user => user.id === uid);
    const score = calculateUserPointsGeral(uid);
    const lastDate = getUserLastSupportDate(uid);
    return { id: uid, nome: u.nome, score, lastDate, index };
  });

  // Ordenação da prioridade (Lei Art. 3º e Art. 8º)
  candidatesList.sort((a, b) => {
    // 1. Menor pontuação geral primeiro
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    
    // 2. Desempate: quem fez apoio mais antigo primeiro
    if (a.lastDate === null && b.lastDate !== null) return -1; // A nunca apoiou -> prioridade A
    if (b.lastDate === null && a.lastDate !== null) return 1;  // B nunca apoiou -> prioridade B
    if (a.lastDate === null && b.lastDate === null) return a.index - b.index; // Ordem de candidatura
    
    const diff = new Date(a.lastDate) - new Date(b.lastDate);
    if (diff !== 0) return diff; // Data antiga ganha
    
    // 3. Ordem de candidatura (Consenso simulado por ordem de inscrição)
    return a.index - b.index;
  });

  return candidatesList[0];
}

// --- RENDERIZADORES DE TELA (HTML DINÂMICO) ---

function renderRoleSelect() {
  let html = '';
  
  html += '<optgroup label="Colaboradores (Apoiadores)">';
  users.filter(u => u.tipo === 'APOIADOR').forEach(u => {
    const score = calculateUserPointsGeral(u.id);
    const isExcluido = u.cargo === 'GPI' || u.cargo === 'OPMAN';
    const scoreLabel = isExcluido ? 'Sem Classif.' : `${score.toFixed(2)} pts`;
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome} (${u.cargo} | ${scoreLabel})
    </option>`;
  });
  html += '</optgroup>';
  
  html += '<optgroup label="Gestão (Administradores)">';
  users.filter(u => u.tipo !== 'APOIADOR').forEach(u => {
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome}
    </option>`;
  });
  html += '</optgroup>';
  
  roleSelect.innerHTML = html;
}

function renderTabs() {
  let html = `<button class="tab-btn ${activeTab === 'all' ? 'active' : ''}" data-tab="all">Todas as Escalas</button>`;
  groups.forEach(g => {
    const label = g.nome.replace('Apoios ', '').replace('Apoio ', '');
    html += `<button class="tab-btn ${activeTab === g.id ? 'active' : ''}" data-tab="${g.id}">${label}</button>`;
  });
  tabContainer.innerHTML = html;

  tabContainer.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      renderTabs();
      renderSlots();
    });
  });
}

function renderAdminBar() {
  if (currentUser.tipo === 'ADMIN') {
    adminActionsBar.style.display = 'flex';
  } else {
    adminActionsBar.style.display = 'none';
  }
}

function renderSlots() {
  let filtered = [...slots];
  filtered.sort((a, b) => new Date(a.data) - new Date(b.data));

  if (activeTab !== 'all') {
    filtered = filtered.filter(s => s.grupoId === activeTab);
  }

  slotsCount.textContent = `${filtered.length} vaga(s) encontrada(s)`;

  if (filtered.length === 0) {
    slotsGrid.innerHTML = `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
        Nenhuma vaga de apoio cadastrada para esta categoria.
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(slot => {
    const isDisputa = candidatos[slot.id] !== undefined;
    const candList = candidatos[slot.id] || [];
    const vencedor = getDisputeWinner(slot.id);
    const apontee = users.find(u => u.id === slot.usuarioId);
    
    // Características previstas
    const regrasPrevistas = slot.regrasPrevistas || [];
    const pesoPrevisao = calculateSupportScore(regrasPrevistas);

    const cardStatusClass = isDisputa ? 'pendente' : slot.status.toLowerCase();

    html += `
      <div class="slot-card glass-panel status-${cardStatusClass}">
        <div class="slot-meta">
          <span class="slot-subgrupo">${slot.subgrupo}</span>
          ${isDisputa ? `
            <span class="badge badge-pending">Em Disputa</span>
          ` : `
            <span class="badge badge-${slot.status.toLowerCase()}">
              ${slot.status === 'LIVRE' ? 'Disponível' : 
                slot.status === 'CANCELADO' ? 'Cancelado' : 'Fechada'}
            </span>
          `}
        </div>

        <div class="slot-schedule">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${formatDatePt(slot.data)}</span>
          <span>•</span>
          <span>Turno: ${slot.horario}</span>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          <strong>Pontuação Prevista:</strong> <code style="color: var(--info); font-weight: bold;">${pesoPrevisao.toFixed(2)} pts</code> 
          ${regrasPrevistas.length > 0 ? `(${regrasPrevistas.join(' × ')})` : ''}
        </div>

        <!-- Se estiver em Disputa por Prioridade (Art. 3º e 8º) -->
        ${isDisputa ? `
          <div style="background: hsla(222, 47%, 9%, 0.6); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">
              👥 Candidatos na fila (${candList.length}):
            </span>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${candList.map((cid, i) => {
                const u = users.find(user => user.id === cid);
                const score = calculateUserPointsGeral(cid);
                const lastDate = getUserLastSupportDate(cid);
                const eLider = vencedor && vencedor.id === cid;
                return `
                  <div style="font-size: 0.72rem; display: flex; justify-content: space-between; align-items: center; color: ${eLider ? 'var(--success)' : 'var(--text-secondary)'}; font-weight: ${eLider ? 700 : 400};">
                    <span>${i+1}. ${u?.nome} ${eLider ? '🏆 (Líder)' : ''}</span>
                    <span style="font-size: 0.65rem;">
                      ${score.toFixed(2)} pts | Último: ${lastDate ? formatDatePt(lastDate) : 'Nenhum'}
                    </span>
                  </div>
                `;
              }).join('')}
              ${candList.length === 0 ? `
                <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
                  Nenhum voluntário inscrito na fila.
                </span>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Se já estiver preenchido -->
        ${!isDisputa && slot.usuarioId ? `
          <div class="slot-details">
            <div class="slot-assignee">
              <div>
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Voluntário confirmado:</span>
                <span class="assignee-name">${apontee?.nome}</span>
              </div>
              <span class="assignee-count" style="font-weight: bold; color: var(--info);">
                ${calculateUserPointsGeral(slot.usuarioId).toFixed(2)} pts gerais
              </span>
            </div>
          </div>
        ` : ''}

        <!-- Ações do Slot -->
        <div class="slot-actions" data-slot-id="${slot.id}">
          <!-- Preenchido via listeners -->
        </div>
      </div>
    `;
  });

  slotsGrid.innerHTML = html;
  attachSlotActionsListeners(filtered);
}

function attachSlotActionsListeners(filteredSlots) {
  filteredSlots.forEach(slot => {
    const actionContainer = slotsGrid.querySelector(`[data-slot-id="${slot.id}"]`);
    if (!actionContainer) return;

    const isDisputa = candidatos[slot.id] !== undefined;
    const candList = candidatos[slot.id] || [];

    let actionHtml = '';

    // 1. Inscrição em vaga direta (Livre comum)
    if (slot.status === 'LIVRE' && !isDisputa && currentUser.tipo === 'APOIADOR') {
      const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
      if (isExcluido) {
        actionHtml = `<button class="btn btn-secondary btn-assumir" style="width: 100%;">🟢 Assumir Apoio (Função Administrativa)</button>`;
      } else {
        actionHtml = `<button class="btn btn-primary btn-assumir" style="width: 100%;">🟢 Assumir Apoio Rápido</button>`;
      }
    }
    // 2. Fila de Candidatura por Prioridade (Art. 3º)
    else if (isDisputa && currentUser.tipo === 'APOIADOR') {
      const jaInscrito = candList.includes(currentUser.id);
      const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
      
      if (isExcluido) {
        actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed;" disabled>⚠️ GPI/OPMAN não disputam prioridade</button>`;
      } else {
        actionHtml = `
          <button class="btn btn-secondary btn-candidatar" style="width: 100%; border-color: var(--warning); color: var(--warning);" ${jaInscrito ? 'disabled' : ''}>
            ${jaInscrito ? '✓ Candidatado na Fila' : '⏳ Candidatar-se à Vaga'}
          </button>
        `;
      }
    }

    // Ações de Administrador
    if (currentUser.tipo === 'ADMIN') {
      if (isDisputa && candList.length > 0) {
        actionHtml += `
          <button class="btn btn-primary btn-resolver-disputa" style="width: 100%; background: var(--warning); color: black; margin-top: 8px;">
            🔒 Fechar Janela e Atribuir ao Líder
          </button>
        `;
      }
      
      actionHtml += `
        <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
          <button class="btn btn-secondary btn-icon-only btn-cancelar-escala" style="font-size: 0.72rem; padding: 4px 8px; color: var(--danger);">
            ⚠️ ${slot.status === 'CANCELADO' ? 'Reativar Slot' : 'Cancelar Slot'}
          </button>
        </div>
      `;
    }

    actionContainer.innerHTML = actionHtml;

    // Conectar eventos
    const btnAssumir = actionContainer.querySelector('.btn-assumir');
    if (btnAssumir) btnAssumir.addEventListener('click', () => handleAssumirVagaDireta(slot.id));

    const btnCandidatar = actionContainer.querySelector('.btn-candidatar');
    if (btnCandidatar) btnCandidatar.addEventListener('click', () => handleCandidatarDisputa(slot.id));

    const btnResolver = actionContainer.querySelector('.btn-resolver-disputa');
    if (btnResolver) btnResolver.addEventListener('click', () => handleEncerrarDisputa(slot.id));

    const btnCancelEscala = actionContainer.querySelector('.btn-cancelar-escala');
    if (btnCancelEscala) btnCancelEscala.addEventListener('click', () => handleCancelarVagaAdmin(slot.id));
  });
}

function renderMyPanel() {
  if (currentUser && currentUser.tipo === 'APOIADOR') {
    myPanelWidget.style.display = 'block';
    
    const score = calculateUserPointsGeral(currentUser.id);
    const lastDate = getUserLastSupportDate(currentUser.id);
    const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';

    myPanelWidget.innerHTML = `
      <h3 class="widget-title">👤 Meu Painel</h3>
      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem;">
        <div>
          <span style="color: var(--text-muted); display: block;">Nome / Cargo:</span>
          <strong>${currentUser.nome} (${currentUser.cargo})</strong>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px;">
          <div>
            <span style="color: var(--text-muted); display: block;">Pontuação Geral:</span>
            <strong style="font-size: 1.2rem; color: ${isExcluido ? 'var(--text-muted)' : 'var(--info)'}">
              ${isExcluido ? 'Sem Classif.' : score.toFixed(4) + ' pts'}
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Último Apoio:</span>
            <strong style="font-size: 0.85rem; color: var(--text-primary)">
              ${lastDate ? formatDatePt(lastDate) : 'Nenhum realizado'}
            </strong>
          </div>
        </div>

        ${currentUser.infracoesWA > 0 ? `
          <div style="font-size: 0.72rem; color: var(--danger); background: var(--danger-glow); padding: 8px; border-radius: 4px; border: 1px solid hsla(0, 84%, 60%, 0.2)">
            ⚠️ Infrações WhatsApp: <strong>${currentUser.infracoesWA}</strong> (+${(currentUser.infracoesWA * 0.01).toFixed(2)} pts aplicados no Geral)
          </div>
        ` : ''}

        ${isExcluido ? `
          <div style="font-size: 0.72rem; color: var(--text-muted); background: hsla(222, 47%, 20%, 0.4); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color)">
            💡 Conforme o <strong>Art. 6º</strong>, as funções de GPI/OPMAN não entram no ranking de prioridade.
          </div>
        ` : ''}
      </div>
    `;
  } else {
    myPanelWidget.style.display = 'none';
  }
}

function renderRanking() {
  let html = '';
  
  // Apoiadores válidos para classificação (Filtrando GPI/OPMAN conforme Art. 6º)
  const classificados = users
    .filter(u => u.tipo === 'APOIADOR' && u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .map(u => {
      return {
        ...u,
        score: calculateUserPointsGeral(u.id),
        lastDate: getUserLastSupportDate(u.id)
      };
    });

  // Ordenação do Ranking de Prioridade (Art. 3º e Art. 8º)
  classificados.sort((a, b) => {
    // 1. Menor pontuação
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    // 2. Data mais antiga (tiebreaker)
    if (a.lastDate === null && b.lastDate !== null) return -1;
    if (b.lastDate === null && a.lastDate !== null) return 1;
    if (a.lastDate === null && b.lastDate === null) return 0;
    
    return new Date(a.lastDate) - new Date(b.lastDate);
  });

  classificados.forEach((u, index) => {
    const rank = index + 1;
    let rankClass = 'rank-other';
    if (rank === 1) rankClass = 'rank-1';
    if (rank === 2) rankClass = 'rank-2';
    if (rank === 3) rankClass = 'rank-3';

    const isCurrentUser = u.id === currentUserId;

    html += `
      <tr class="ranking-row ${isCurrentUser ? 'current-user' : ''}">
        <td>
          <span class="rank-badge ${rankClass}">${rank}</span>
        </td>
        <td>
          <span style="font-weight: 600;">${u.nome}</span>
          ${u.infracoesWA > 0 ? ` <span style="font-size: 0.65rem; color: var(--danger);" title="Infrações WhatsApp">⚠️ ${u.infracoesWA}</span>` : ''}
          ${isCurrentUser ? ' <small>(Você)</small>' : ''}
        </td>
        <td style="text-align: center; font-size: 0.75rem; color: var(--text-secondary);">
          ${u.lastDate ? formatDatePt(u.lastDate) : '<span style="color: var(--text-muted);">Nenhum</span>'}
        </td>
        <td style="text-align: right; font-weight: bold; color: var(--info);">
          ${u.score.toFixed(4)}
        </td>
      </tr>
    `;
  });

  // Mostrar também os não-classificados no rodapé da tabela com aviso
  const naoClassificados = users.filter(u => u.tipo === 'APOIADOR' && (u.cargo === 'GPI' || u.cargo === 'OPMAN'));
  if (naoClassificados.length > 0) {
    html += `
      <tr style="background: hsla(222, 47%, 5%, 0.5);"><td colspan="4" style="font-size: 0.7rem; color: var(--text-muted); text-align: center; border-bottom: none; padding: 6px;">Excluídos da Classificação (Art. 6º)</td></tr>
    `;
    naoClassificados.forEach(u => {
      const isCurrentUser = u.id === currentUserId;
      html += `
        <tr class="ranking-row ${isCurrentUser ? 'current-user' : ''}" style="opacity: 0.6;">
          <td><span class="rank-badge rank-other">-</span></td>
          <td>${u.nome} (${u.cargo})</td>
          <td style="text-align: center; font-size: 0.75rem;">Sem Classif.</td>
          <td style="text-align: right;">-</td>
        </tr>
      `;
    });
  }

  rankingTableBody.innerHTML = html;
}

function renderHistoryTable() {
  const historyTableBody = document.getElementById('history-table-body');
  let html = '';

  const sortedHistory = [...history];
  sortedHistory.sort((a, b) => new Date(b.data) - new Date(a.data)); // Mais recente primeiro

  sortedHistory.forEach(h => {
    const user = users.find(u => u.id === h.usuarioId);
    const regBy = users.find(u => u.id === h.registradoPorId);
    
    html += `
      <tr>
        <td><strong>${formatDatePt(h.data)}</strong></td>
        <td>${user?.nome || 'Desconhecido'}</td>
        <td>${h.subgrupo}</td>
        <td>
          ${h.regras.map(rid => {
            const rule = SUPPORT_RULES.find(r => r.id === rid);
            const color = rid === 'R13' ? 'var(--danger)' : 'var(--primary)';
            return `<code style="font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; background: hsla(222, 47%, 20%, 0.5); color: ${color}; margin-right: 4px;" title="${rule?.descricao}">${rid}</code>`;
          }).join('')}
        </td>
        <td>
          <span style="font-size: 0.72rem; color: var(--text-muted);">
            Em: ${formatDatePt(h.dataRegistro.split('T')[0])} por ${regBy?.nome || 'Sistema'}
          </span>
        </td>
        <td style="text-align: right; font-weight: bold; color: var(--info);">${h.pontuacao.toFixed(4)} pts</td>
        <td style="text-align: center;">
          ${currentUser.tipo === 'ADMIN' ? `
            <button class="btn btn-secondary btn-icon-only btn-excluir-historico" data-id="${h.id}" title="Excluir Registro" style="color: var(--danger); padding: 2px 6px;">✕</button>
          ` : '-'}
        </td>
      </tr>
    `;
  });

  if (sortedHistory.length === 0) {
    html = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum apoio registrado no histórico de 2026.</td></tr>`;
  }

  historyTableBody.innerHTML = html;

  // Listeners de exclusão (Admin)
  if (currentUser.tipo === 'ADMIN') {
    historyTableBody.querySelectorAll('.btn-excluir-historico').forEach(btn => {
      btn.addEventListener('click', () => {
        const hid = btn.getAttribute('data-id');
        handleExcluirHistorico(hid);
      });
    });
  }
}

function renderFormGroupsOptions() {
  const selectGrupo = document.getElementById('form-grupo');
  let html = '';
  groups.forEach(g => {
    html += `<option value="${g.id}">${g.nome}</option>`;
  });
  selectGrupo.innerHTML = html;

  // Preencher usuários aptos no formulário de auto-registro
  const selectRegUsuario = document.getElementById('reg-usuario');
  let userHtml = '';
  users.filter(u => u.tipo === 'APOIADOR').forEach(u => {
    userHtml += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });
  selectRegUsuario.innerHTML = userHtml;
  selectRegUsuario.addEventListener('change', () => {
    checkLateSubmission();
    updatePointsPreview();
  });

  // Preencher usuários na modal de infrações
  const selectInfUsuario = document.getElementById('inf-usuario');
  let infHtml = '';
  users.filter(u => u.tipo === 'APOIADOR').forEach(u => {
    infHtml += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });
  selectInfUsuario.innerHTML = infHtml;
}

function renderRulesCheckboxes() {
  // Checkboxes na view de registro (R1 a R12)
  let html = '';
  SUPPORT_RULES.filter(r => r.id !== 'R13').forEach(r => {
    html += `
      <label class="rules-checkbox-item">
        <input type="checkbox" name="reg-regras" value="${r.id}" data-peso="${r.peso}">
        <div>
          <strong>${r.id}</strong> - ${r.descricao} 
          <small style="color: var(--info);">(Peso ${r.peso})</small>
        </div>
      </label>
    `;
  });
  rulesCheckboxContainer.innerHTML = html;

  // Checkboxes na modal de criação de escala
  let modalHtml = '';
  SUPPORT_RULES.filter(r => r.id !== 'R13').forEach(r => {
    modalHtml += `
      <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; padding: 4px;">
        <input type="checkbox" name="modal-prev-regras" value="${r.id}">
        <span><strong>${r.id}</strong> - ${r.descricao}</span>
      </label>
    `;
  });
  modalRulesCheckboxes.innerHTML = modalHtml;

  // Listeners de mudança no form de registro para atualizar a prévia de pontos
  rulesCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updatePointsPreview);
  });
}

// --- LÓGICA DE PRÉ-VISUALIZAÇÃO DE CÁLCULO ---

function updatePointsPreview() {
  const selectedCbs = rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]:checked');
  const regras = Array.from(selectedCbs).map(cb => cb.value);

  const isLate = isSubmissionLate();
  
  if (isLate) {
    // Se estiver atrasado, a penalidade R13 é aplicada automaticamente, desabilitando/ignorando as outras
    regPointsPreview.textContent = '2.00';
    regPointsPreview.style.color = 'var(--danger)';
    regFormulaPreview.textContent = 'R13 Penalidade (Peso 20 / 10 = 2.0)';
    
    // Desabilitar visualmente outros checkboxes
    rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => {
      cb.disabled = true;
    });
  } else {
    // Re-habilitar outros checkboxes
    rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => {
      cb.disabled = false;
    });

    if (regras.length === 0) {
      regPointsPreview.textContent = '0.00';
      regPointsPreview.style.color = 'var(--text-muted)';
      regFormulaPreview.textContent = 'Nenhuma característica selecionada';
      return;
    }

    let prod = 1.0;
    let formulaText = '';
    regras.forEach((rid, index) => {
      const rule = SUPPORT_RULES.find(r => r.id === rid);
      prod *= (rule.peso / 10);
      formulaText += `${index > 0 ? ' × ' : ''}(${rule.peso}/10)`;
    });

    const score = parseFloat(prod.toFixed(4));
    regPointsPreview.textContent = score.toFixed(4);
    regPointsPreview.style.color = 'var(--info)';
    regFormulaPreview.textContent = `${formulaText} = ${score.toFixed(4)}`;
  }
}

function isSubmissionLate() {
  const supportDateVal = regDataInput.value;
  if (!supportDateVal) return false;

  const supportDate = new Date(supportDateVal + 'T23:59:59'); // Fim do dia do apoio
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00'); // Começo do dia simulado lançamento

  // Diferença em milissegundos
  const diffTime = simDate - supportDate;
  
  // 72 horas = 3 dias
  const limitMs = 3 * 24 * 60 * 60 * 1000;
  
  return diffTime > limitMs;
}

function checkLateSubmission() {
  const isLate = isSubmissionLate();
  if (isLate) {
    regDateWarning.style.display = 'block';
  } else {
    regDateWarning.style.display = 'none';
  }
  updatePointsPreview();
}

// --- EVENT HANDLERS ---

// 1. Assumir vaga direta (Escala Livre)
function handleAssumirVagaDireta(slotId) {
  if (!currentUser || currentUser.tipo !== 'APOIADOR') {
    showBanner('Apenas apoiadores podem assumir escalas.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);

  // Atribuir o apoio
  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, status: 'ATRIBUIDO', usuarioId: currentUser.id };
    }
    return s;
  });

  // Também criar um registro concluído imediatamente no histórico
  const historyId = 'h_' + Date.now();
  const regras = slot.regrasPrevistas || ['R1']; // Usa regras previstas ou R1 como padrão
  
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

  history = [...history, novoHistorico];

  showBanner(`Vaga de apoio confirmada e registrada no histórico para ${formatDatePt(slot.data)} (${score.toFixed(2)} pts)!`, 'success');
  persistChanges();
}

// 2. Candidatar-se na Fila de Prioridade (Art. 3º)
function handleCandidatarDisputa(slotId) {
  if (!currentUser || currentUser.tipo !== 'APOIADOR') {
    showBanner('Apenas apoiadores podem se candidatar.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];

  if (list.includes(currentUser.id)) {
    showBanner('Você já está inscrito nesta vaga.', 'warning');
    return;
  }

  candidatos[slotId] = [...list, currentUser.id];
  showBanner(`Candidatura na fila registrada para a vaga de ${formatDatePt(slot.data)}!`, 'success');
  renderSlots();
}

// 3. Encerrar disputa e atribuir por prioridade
function handleEncerrarDisputa(slotId) {
  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];

  if (list.length === 0) {
    showBanner('Nenhum candidato inscrito nesta vaga.', 'warning');
    return;
  }

  const vencedor = getDisputeWinner(slotId);
  const userVencedor = users.find(u => u.id === vencedor.id);

  // Atribuir na escala
  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, status: 'ATRIBUIDO', usuarioId: vencedor.id };
    }
    return s;
  });

  // Registrar no histórico
  const historyId = 'h_' + Date.now();
  const regras = slot.regrasPrevistas || ['R1'];
  
  const supportDate = new Date(slot.data + 'T00:00:00');
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
  const eAtrasado = (simDate - supportDate) > (3 * 24 * 60 * 60 * 1000);
  
  const finalRegras = eAtrasado ? ['R13'] : regras;
  const score = calculateSupportScore(finalRegras);

  const novoHistorico = {
    id: historyId,
    usuarioId: vencedor.id,
    data: slot.data,
    subgrupo: slot.subgrupo,
    regras: finalRegras,
    pontuacao: score,
    dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
    registradoPorId: currentUser.id // Admin registrou
  };

  history = [...history, novoHistorico];

  showBanner(`Disputa encerrada! Vaga atribuída ao líder ${userVencedor.nome} (${vencedor.score.toFixed(2)} pts gerais)`, 'success');
  
  delete candidatos[slotId];
  persistChanges();
}

// 4. Auto-registro manual de Apoio Concluído (Art. 9º)
function handleAutoRegistroApoio(e) {
  e.preventDefault();

  const regUserId = regUsuarioSelect.value;
  const regSubgrupo = regSubgrupoInput.value;
  const regData = regDataInput.value;

  if (!regSubgrupo || !regData) {
    showBanner('Preencha os campos obrigatórios.', 'danger');
    return;
  }

  const isLate = isSubmissionLate();
  let regras = [];

  if (isLate) {
    regras = ['R13'];
  } else {
    const checkedRules = rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]:checked');
    regras = Array.from(checkedRules).map(cb => cb.value);
  }

  if (regras.length === 0) {
    showBanner('Selecione pelo menos uma característica para o apoio.', 'danger');
    return;
  }

  const score = calculateSupportScore(regras);
  const historyId = 'h_' + Date.now();

  const novoHistorico = {
    id: historyId,
    usuarioId: regUserId,
    data: regData,
    subgrupo: regSubgrupo,
    regras: regras,
    pontuacao: score,
    dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
    registradoPorId: currentUser.id
  };

  history = [...history, novoHistorico];

  const user = users.find(u => u.id === regUserId);
  showBanner(`Apoio registrado para ${user.nome}! Pontuação calculada: ${score.toFixed(4)} pts.`, 'success');

  // Reset do form
  regSubgrupoInput.value = '';
  regDataInput.value = '';
  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => cb.checked = false);
  checkLateSubmission();

  persistChanges();
  switchView('historico'); // Mostra a tabela de histórico
}

// 5. Cancelar / Reativar Vaga (Admin)
function handleCancelarVagaAdmin(slotId) {
  const slot = slots.find(s => s.id === slotId);
  const statusAtual = slot.status;

  slots = slots.map(s => {
    if (s.id === slotId) {
      return {
        ...s,
        status: statusAtual === 'CANCELADO' ? 'LIVRE' : 'CANCELADO',
        usuarioId: null
      };
    }
    return s;
  });

  showBanner(statusAtual === 'CANCELADO' ? 'Slot de escala reativado.' : 'Solicitação de apoio cancelada.', 'info');
  persistChanges();
}

// 6. Criar nova solicitação de slot de escala (Admin)
function handleCriarSolicitacaoSlot(e) {
  e.preventDefault();

  const formGrupo = document.getElementById('form-grupo').value;
  const formSubgrupo = document.getElementById('form-subgrupo').value;
  const formData = document.getElementById('form-data').value;
  const formHorario = document.getElementById('form-horario').value;
  const formMotivo = document.getElementById('form-motivo').value;
  const formPrioridade = document.querySelector('input[name="prioridade"]:checked').value;

  const modalCbs = modalRulesCheckboxes.querySelectorAll('input[name="modal-prev-regras"]:checked');
  const regrasPrevistas = Array.from(modalCbs).map(cb => cb.value);

  if (!formSubgrupo || !formData) {
    showBanner('Preencha os campos obrigatórios.', 'danger');
    return;
  }

  const slotId = 's_' + Date.now();
  const novoSlot = {
    id: slotId,
    grupoId: formGrupo,
    subgrupo: formSubgrupo,
    data: formData,
    horario: formHorario,
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false,
    regrasPrevistas: regrasPrevistas
  };

  if (formMotivo) {
    novoSlot.motivo = formMotivo;
  }

  slots = [...slots, novoSlot];

  if (formPrioridade === 'disputa') {
    candidatos[slotId] = [];
  }

  addModal.style.display = 'none';
  showBanner('Nova escala de apoio cadastrada!', 'success');

  // Reset form
  document.getElementById('form-subgrupo').value = '';
  document.getElementById('form-data').value = '';
  document.getElementById('form-motivo').value = '';
  modalRulesCheckboxes.querySelectorAll('input[name="modal-prev-regras"]').forEach(cb => cb.checked = false);

  persistChanges();
}

// 7. Aplicar Infração de WhatsApp (Art. 7º - Admin)
function handleAplicarInfracao(e) {
  e.preventDefault();

  const infUserId = document.getElementById('inf-usuario').value;
  const user = users.find(u => u.id === infUserId);

  users = users.map(u => {
    if (u.id === infUserId) {
      return { ...u, infracoesWA: (u.infracoesWA || 0) + 1 };
    }
    return u;
  });

  infracaoModal.style.display = 'none';
  showBanner(`Penalidade aplicada a ${user.nome}! (+0.01 somado à classificação geral)`, 'warning');
  
  persistChanges();
}

// 8. Excluir Lançamento do Histórico (Admin)
function handleExcluirHistorico(historyId) {
  const item = history.find(h => h.id === historyId);
  const user = users.find(u => u.id === item.usuarioId);

  history = history.filter(h => h.id !== historyId);
  showBanner(`Registro do dia ${formatDatePt(item.data)} de ${user?.nome || 'colaborador'} excluído do histórico.`, 'info');
  
  persistChanges();
}

// --- INTEGRÇÃO WHATSAPP ---
function openWhatsappExporter() {
  whatsappExportArea.value = generateWhatsappTemplate();
  whatsappModal.style.display = 'flex';
}

function generateWhatsappTemplate() {
  let output = '';

  groups.forEach(group => {
    const groupSlots = slots.filter(s => s.grupoId === group.id);
    if (groupSlots.length === 0) return;

    output += `🚦*${group.nome}*\n\n`;

    const slotsBySubgrupo = {};
    groupSlots.forEach(s => {
      if (!slotsBySubgrupo[s.subgrupo]) {
        slotsBySubgrupo[s.subgrupo] = [];
      }
      slotsBySubgrupo[s.subgrupo].push(s);
    });

    Object.keys(slotsBySubgrupo).forEach(sub => {
      output += `*${sub.toUpperCase()}*\n`;
      
      slotsBySubgrupo[sub].forEach(s => {
        const u = users.find(user => user.id === s.usuarioId);
        let userText = '';
        const isDisp = candidatos[s.id] !== undefined;

        if (s.status === 'CANCELADO') {
          userText = '*CANCELADO*';
        } else if (isDisp) {
          userText = ''; // Mostra vazio para preencherem
        } else if (s.status === 'ATRIBUIDO') {
          userText = `${u?.nome || ''}`;
        }

        output += `${formatDatePt(s.data)} - ${s.horario}: ${userText}\n`;
      });
      
      output += `\n`;
    });

    output += `Obs.: Quem estiver disponível, informar o número de apoios no mês.\n`;
    output += `Se o número de apoios for superior a 3 será solicitada autorização gerencial.\n\n`;
    output += `Obrigado!\n`;
    output += `*-----------------------------------*\n\n`;
  });

  return output;
}

function handleCopyClipboard() {
  const text = generateWhatsappTemplate();
  navigator.clipboard.writeText(text).then(() => {
    showBanner('Template copiado para a área de transferência!', 'success');
    whatsappModal.style.display = 'none';
  }).catch(() => {
    showBanner('Erro ao copiar texto.', 'danger');
  });
}

// --- UTILS ---

function formatDatePt(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function showBanner(message, type = 'success') {
  const banner = document.createElement('div');
  banner.className = `notification-banner banner-${type}`;
  banner.innerHTML = `
    <span>${message}</span>
    <button style="background: transparent; border: none; cursor: pointer; color: inherit; font-weight: bold; margin-left: 10px;">✕</button>
  `;
  
  notificationContainer.appendChild(banner);
  
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.5s ease';
    setTimeout(() => banner.remove(), 500);
  }, 5000);

  banner.querySelector('button').addEventListener('click', () => {
    banner.remove();
  });
}

// Rodar na carga
document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  init();
}
