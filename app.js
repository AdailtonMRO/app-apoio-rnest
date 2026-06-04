import { getStoredData, saveStoredData, SUPPORT_RULES } from './data.js';

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let users = [];
let groups = [];
let slots = [];
let history = [];

// Perfil simulado ativo
let currentUserId = 'AB2U'; // Syan Addy Vasconcellos por padrão (Operador)
let currentUser = null;

// Abas de visualização principal e escalas
let currentView = 'escalas'; // 'escalas', 'registro', 'historico', 'usuarios'
let activeTab = 'all';
let editingHistoryId = null;
let editingSlotId = null;

// Data simulada atual (para testes da regra de 72h)
let simulatedCurrentDate = '2026-06-04';

// Candidaturas a vagas em disputa (Chaves reais correspondentes ao novo seed)
let candidatos = {
  's_f1': ['Ab5a', 'Kbvx'], // Alan Bernardino (27.60), George Lima (21.30)
  's_f2': ['Ab3r'],        // Adailton Medeiros (29.31)
  's_f3': ['Kva8 ', 'ab1j']   // Java Lauriano (37.26), Isaias Moura (28.13)
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
const tabBtnUsuarios = document.getElementById('tab-btn-usuarios');
const viewEscalas = document.getElementById('view-escalas');
const viewRegistro = document.getElementById('view-registro');
const viewHistorico = document.getElementById('view-historico');
const viewUsuarios = document.getElementById('view-usuarios');

// Modais - Escalas
const addModal = document.getElementById('add-modal');
const btnOpenAddModal = document.getElementById('btn-open-add-modal');
const btnCloseAddModal = document.getElementById('btn-close-add-modal');
const btnCancelAddModal = document.getElementById('btn-cancel-add-modal');
const addSlotForm = document.getElementById('add-slot-form');
const modalRulesCheckboxes = document.getElementById('modal-rules-checkboxes');

// Modais - WhatsApp
const whatsappModal = document.getElementById('whatsapp-modal');
const btnOpenWhatsappModal = document.getElementById('btn-open-whatsapp-modal');
const btnCloseWhatsappModal = document.getElementById('btn-close-whatsapp-modal');
const btnCancelWhatsappModal = document.getElementById('btn-cancel-whatsapp-modal');
const whatsappExportArea = document.getElementById('whatsapp-export-area');
const btnCopyWhatsapp = document.getElementById('btn-copy-whatsapp');

// Modais - Infração WhatsApp
const infracaoModal = document.getElementById('infracao-modal');
const btnOpenInfracaoModal = document.getElementById('btn-open-infracao-modal');
const btnCloseInfracaoModal = document.getElementById('btn-close-infracao-modal');
const btnCancelInfracaoModal = document.getElementById('btn-cancel-infracao-modal');
const infracaoForm = document.getElementById('infracao-form');

// Modais - Usuários
const userModal = document.getElementById('user-modal');
const userModalTitle = document.getElementById('user-modal-title');
const btnOpenUserModal = document.getElementById('btn-open-user-modal');
const btnCloseUserModal = document.getElementById('btn-close-user-modal');
const btnCancelUserModal = document.getElementById('btn-cancel-user-modal');
const userForm = document.getElementById('user-form');
const userFormMode = document.getElementById('user-form-mode');
const userFormOldChave = document.getElementById('user-form-old-chave');
const userFormChave = document.getElementById('user-form-chave');
const userFormNome = document.getElementById('user-form-nome');
const userFormCargo = document.getElementById('user-form-cargo');
const userFormNivel = document.getElementById('user-form-nivel');
const userSearchInput = document.getElementById('user-search-input');
const usersTableBody = document.getElementById('users-table-body');

// Formulário de Auto-Registro
const regUsuarioSelect = document.getElementById('reg-usuario');
const regSubgrupoInput = document.getElementById('reg-subgrupo');
const regDataInput = document.getElementById('reg-data');
const regDataLancamentoInput = document.getElementById('reg-data-lancamento');
const regDateWarning = document.getElementById('reg-date-warning');
const regBypassContainer = document.getElementById('reg-bypass-container');
const regBypassLimit = document.getElementById('reg-bypass-limit');
const rulesCheckboxContainer = document.getElementById('rules-checkbox-container');
const regPointsPreview = document.getElementById('reg-points-preview');
const regFormulaPreview = document.getElementById('reg-formula-preview');
const registerCompletedSupportForm = document.getElementById('register-completed-support-form');
const regFormTitle = document.getElementById('reg-form-title');
const btnCancelEditReg = document.getElementById('btn-cancel-edit-reg');
const btnSubmitReg = document.getElementById('btn-submit-reg');

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
  tabBtnUsuarios.addEventListener('click', () => switchView('usuarios'));

  // Listeners de simulação
  roleSelect.addEventListener('change', handleRoleChange);
  btnResetDemo.addEventListener('click', resetDemo);
  simCurrentDateInput.addEventListener('change', handleSimDateChange);

  // Modais - Adicionar Escala
  btnOpenAddModal.addEventListener('click', () => addModal.style.display = 'flex');
  btnCloseAddModal.addEventListener('click', handleCancelarSlotModal);
  btnCancelAddModal.addEventListener('click', handleCancelarSlotModal);
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

  // Modais - Usuários
  btnOpenUserModal.addEventListener('click', () => openUserModal('add'));
  btnCloseUserModal.addEventListener('click', () => userModal.style.display = 'none');
  btnCancelUserModal.addEventListener('click', () => userModal.style.display = 'none');
  userForm.addEventListener('submit', handleSaveUser);
  userSearchInput.addEventListener('keyup', renderUsersTable);

  // Formulário de Auto-Registro - Eventos
  regDataInput.addEventListener('change', checkLateSubmission);
  regBypassLimit.addEventListener('change', updatePointsPreview);
  btnCancelEditReg.addEventListener('click', handleCancelarEdicaoApoio);
  registerCompletedSupportForm.addEventListener('submit', handleAutoRegistroApoio);
  document.getElementById('history-filter-user').addEventListener('change', renderHistoryTable);

  // Preencher elementos de formulário
  renderFormGroupsOptions();
  renderRulesCheckboxes();

  // Fechar modais ao clicar fora
  window.addEventListener('click', (e) => {
    if (e.target === addModal) handleCancelarSlotModal();
    if (e.target === whatsappModal) whatsappModal.style.display = 'none';
    if (e.target === infracaoModal) infracaoModal.style.display = 'none';
    if (e.target === userModal) userModal.style.display = 'none';
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
  tabBtnUsuarios.classList.toggle('active', view === 'usuarios');

  // Atualizar contêineres
  viewEscalas.style.display = view === 'escalas' ? 'block' : 'none';
  viewRegistro.style.display = view === 'registro' ? 'block' : 'none';
  viewHistorico.style.display = view === 'historico' ? 'block' : 'none';
  viewUsuarios.style.display = view === 'usuarios' ? 'block' : 'none';

  if (view === 'registro') {
    const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
    
    // Configurar o usuário atual selecionado no formulário se não estiver em edição
    if (!editingHistoryId) {
      const apoiadores = users.filter(u => u.tipo === 'OPERADOR');
      if (apoiadores.length > 0) {
        regUsuarioSelect.value = currentUser.tipo === 'OPERADOR' ? currentUser.id : apoiadores[0].id;
      }
    }
    
    if (isGestor) {
      regBypassContainer.style.display = 'block';
    } else {
      regBypassContainer.style.display = 'none';
      regBypassLimit.checked = false;
    }
    
    updatePointsPreview();
  } else {
    // Limpar estado de edição ao sair da aba de registro
    editingHistoryId = null;
    regFormTitle.textContent = 'Registrar Apoio Concluído (Dobra Efetuada)';
    btnCancelEditReg.style.display = 'none';
    btnSubmitReg.textContent = '💾 Gravar Apoio e Atualizar Ranking';
  }

  if (view === 'historico') {
    renderHistoryTable();
  }

  if (view === 'usuarios') {
    renderUsersTable();
  }
}

function populateHistoryFilterUsers() {
  const filterSelect = document.getElementById('history-filter-user');
  if (!filterSelect) return;
  
  const currentValue = filterSelect.value || 'all';
  
  const sortedOperators = users
    .filter(u => u.tipo === 'OPERADOR')
    .sort((a, b) => a.nome.localeCompare(b.nome));
    
  let html = '<option value="all">-- Todos os Colaboradores --</option>';
  sortedOperators.forEach(u => {
    html += `<option value="${u.id}">${u.nome} (${u.id.toUpperCase()})</option>`;
  });
  
  filterSelect.innerHTML = html;
  filterSelect.value = currentValue;
}

function verHistoricoUsuario(userId) {
  const filterSelect = document.getElementById('history-filter-user');
  if (filterSelect) {
    filterSelect.value = userId;
  }
  switchView('historico');
}

function hasHigherPriority(userAId, userBId) {
  const scoreA = calculateUserPointsGeral(userAId);
  const scoreB = calculateUserPointsGeral(userBId);
  
  if (scoreA !== scoreB) {
    return scoreA < scoreB;
  }
  
  const dateA = getUserLastSupportDate(userAId);
  const dateB = getUserLastSupportDate(userBId);
  
  if (dateA === null && dateB !== null) return true;
  if (dateB === null && dateA !== null) return false;
  if (dateA === null && dateB === null) return false;
  
  return new Date(dateA) < new Date(dateB);
}

function handleSubstituirVaga(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const oldAssigneeId = slot.usuarioId;
  const oldUser = users.find(u => u.id === oldAssigneeId);

  // 1. Remover histórico do antigo
  const indexToRemove = history.findIndex(h => h.usuarioId === oldAssigneeId && h.data === slot.data);
  if (indexToRemove !== -1) {
    history.splice(indexToRemove, 1);
  }

  // 2. Reatribuir
  slot.usuarioId = currentUser.id;

  // 3. Novo histórico
  const historyId = 'h_' + Date.now();
  const regras = slot.regrasPrevistas || ['R1'];
  
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

  showBanner(`Você assumiu a vaga de ${oldUser?.nome || 'colaborador'} por possuir maior prioridade!`, 'success');
  persistChanges();
}

function handleIniciarEdicaoHistorico(historyId) {
  const item = history.find(h => h.id === historyId);
  if (!item) return;

  editingHistoryId = historyId;
  switchView('registro');

  regUsuarioSelect.value = item.usuarioId;
  regSubgrupoInput.value = item.subgrupo;
  regDataInput.value = item.data;

  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => {
    cb.checked = item.regras.includes(cb.value);
  });

  regFormTitle.textContent = 'Editar Apoio Concluído';
  btnCancelEditReg.style.display = 'inline-flex';
  btnSubmitReg.textContent = '💾 Salvar Alterações e Recalcular Ranking';

  checkLateSubmission();
}

function handleCancelarEdicaoApoio() {
  editingHistoryId = null;
  regSubgrupoInput.value = '';
  regDataInput.value = '';
  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => cb.checked = false);
  if (regBypassLimit) regBypassLimit.checked = false;
  
  switchView('historico');
}

// --- CONTROLE DE MUDANÇA DE CONFIGURAÇÃO SIMULADA ---

function handleRoleChange(e) {
  currentUserId = e.target.value;
  currentUser = users.find(u => u.id === currentUserId);
  renderAll();
  
  // Se mudar para operador na aba de usuários, move para escalas
  const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  if (!isGestor && currentView === 'usuarios') {
    switchView('escalas');
  }

  // Atualiza a aba de registro se for nela para ajustar os campos
  if (currentView === 'registro') {
    switchView('registro');
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
  localStorage.removeItem('rnest_law_users_v5');
  localStorage.removeItem('rnest_law_groups_v5');
  localStorage.removeItem('rnest_law_slots_v5');
  localStorage.removeItem('rnest_law_history_v5');

  candidatos = {
    's_f1': ['Ab5a', 'Kbvx'],
    's_f2': ['Ab3r'],
    's_f3': ['Kva8 ', 'ab1j']
  };

  currentUserId = 'AB2U'; // Syan Addy
  simulatedCurrentDate = '2026-06-04';
  simCurrentDateInput.value = simulatedCurrentDate;
  regDataLancamentoInput.value = formatDatePt(simulatedCurrentDate);

  loadData();
  renderAll();
  showBanner('Simulação e histórico resetados!', 'info');
}

// --- CÁLCULOS DA LEI DE APOIO (FÓRMULAS OFICIAIS) ---

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

function getUserLastSupportDate(userId) {
  const userHistory = history.filter(h => h.usuarioId === userId);
  if (userHistory.length === 0) return null;
  
  userHistory.sort((a, b) => new Date(b.data) - new Date(a.data));
  return userHistory[0].data;
}

function calculateUserPointsGeral(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return 0.0;

  if (user.cargo === 'GPI' || user.cargo === 'OPMAN') {
    return 0.0; // Não entram na classificação geral (Art. 6º)
  }

  const userHistory = history.filter(h => h.usuarioId === userId);
  let sum = userHistory.reduce((acc, h) => acc + h.pontuacao, 0.0);
  
  if (user.infracoesWA) {
    sum += user.infracoesWA * 0.01;
  }

  return parseFloat(sum.toFixed(4));
}

function getDisputeWinner(slotId) {
  const candIds = candidatos[slotId] || [];
  if (candIds.length === 0) return null;

  const candidatesList = candIds.map((uid, index) => {
    const u = users.find(user => user.id === uid);
    const score = calculateUserPointsGeral(uid);
    const lastDate = getUserLastSupportDate(uid);
    return { id: uid, nome: u?.nome || 'Desconhecido', score, lastDate, index };
  });

  candidatesList.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    
    if (a.lastDate === null && b.lastDate !== null) return -1;
    if (b.lastDate === null && a.lastDate !== null) return 1;
    if (a.lastDate === null && b.lastDate === null) return a.index - b.index;
    
    const diff = new Date(a.lastDate) - new Date(b.lastDate);
    if (diff !== 0) return diff;
    
    return a.index - b.index;
  });

  return candidatesList[0];
}

// --- RENDERIZADORES DE TELA (HTML DINÂMICO) ---

function renderAll() {
  renderRoleSelect();
  renderTabs();
  renderAdminBar();
  renderSlots();
  renderMyPanel();
  renderRanking();
  renderFormGroupsOptions();
  populateHistoryFilterUsers();
}

function renderRoleSelect() {
  let html = '';
  
  html += '<optgroup label="Colaboradores (Apoiadores)">';
  users.filter(u => u.tipo === 'OPERADOR').forEach(u => {
    const score = calculateUserPointsGeral(u.id);
    const isExcluido = u.cargo === 'GPI' || u.cargo === 'OPMAN';
    const scoreLabel = isExcluido ? 'Sem Classif.' : `${score.toFixed(2)} pts`;
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome} (${u.cargo} | ${scoreLabel} | ${u.tipo})
    </option>`;
  });
  html += '</optgroup>';
  
  html += '<optgroup label="Gestão (Administradores/Supervisores)">';
  users.filter(u => u.tipo !== 'OPERADOR').forEach(u => {
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome} (${u.cargo} | ${u.tipo})
    </option>`;
  });
  html += '</optgroup>';
  
  roleSelect.innerHTML = html;
}

function renderTabs() {
  const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  
  // Mostrar/esconder aba de usuários com base na hierarquia
  if (isGestor) {
    tabBtnUsuarios.style.display = 'inline-flex';
  } else {
    tabBtnUsuarios.style.display = 'none';
  }

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
  const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  
  if (isGestor) {
    adminActionsBar.style.display = 'flex';
    
    // Configurar botões específicos conforme cargo
    const btnCreate = document.getElementById('btn-open-add-modal');
    // Admin, Gerente e Supervisor criam escala
    if (currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR') {
      btnCreate.style.display = 'inline-flex';
    } else {
      btnCreate.style.display = 'none';
    }

    // Apenas Admin e Gerente aplicam multas de WhatsApp
    const btnInfracao = document.getElementById('btn-open-infracao-modal');
    if (currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE') {
      btnInfracao.style.display = 'inline-flex';
    } else {
      btnInfracao.style.display = 'none';
    }
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
                    <span>${i+1}. ${u?.nome || 'Desconhecido'} ${eLider ? '🏆 (Líder)' : ''}</span>
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
                <span class="assignee-name">${apontee?.nome || 'Desconhecido'}</span>
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
    const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';

    let actionHtml = '';

    // 1. Inscrição em vaga direta (Livre comum)
    if (slot.status === 'LIVRE' && !isDisputa && currentUser.tipo === 'OPERADOR') {
      const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
      if (isExcluido) {
        actionHtml = `<button class="btn btn-secondary btn-assumir" style="width: 100%;">🟢 Assumir Apoio (Função Administrativa)</button>`;
      } else {
        actionHtml = `<button class="btn btn-primary btn-assumir" style="width: 100%;">🟢 Assumir Apoio Rápido</button>`;
      }
    }
    // 2. Fila de Candidatura por Prioridade (Art. 3º)
    else if (isDisputa && currentUser.tipo === 'OPERADOR') {
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
    // 3. Substituição/Deslocamento de voluntário por prioridade (bumping)
    else if (slot.status === 'ATRIBUIDO' && !isDisputa && currentUser.tipo === 'OPERADOR') {
      const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
      if (slot.usuarioId !== currentUser.id && !isExcluido) {
        const occupant = users.find(u => u.id === slot.usuarioId);
        const occupantIsExcluido = occupant && (occupant.cargo === 'GPI' || occupant.cargo === 'OPMAN');
        const hasPriority = occupantIsExcluido || hasHigherPriority(currentUser.id, slot.usuarioId);
        
        if (hasPriority) {
          actionHtml = `<button class="btn btn-primary btn-substituir" style="width: 100%;">🔄 Substituir (Maior Prioridade)</button>`;
        } else {
          actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed;" disabled>🔒 Ocupado (Maior Prioridade)</button>`;
        }
      }
    }

    // Ações de Gestão (Fechar Disputa, Cancelar Vaga)
    if (isGestor) {
      if (isDisputa && candList.length > 0) {
        actionHtml += `
          <button class="btn btn-primary btn-resolver-disputa" style="width: 100%; background: var(--warning); color: black; margin-top: 8px;">
            🔒 Fechar Janela e Atribuir ao Líder
          </button>
        `;
      }
      
      // Cancelar/Editar Escala (Somente Admin, Gerente e Supervisor)
      if (currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR') {
        actionHtml += `
          <div style="margin-top: 8px; display: flex; justify-content: flex-end; gap: 8px; align-items: center;">
            <button class="btn btn-secondary btn-icon-only btn-editar-escala" style="font-size: 0.72rem; padding: 4px 8px; color: var(--info);" title="Editar Escala">
              ✏️ Editar
            </button>
            <button class="btn btn-secondary btn-icon-only btn-cancelar-escala" style="font-size: 0.72rem; padding: 4px 8px; color: var(--danger);">
              ⚠️ ${slot.status === 'CANCELADO' ? 'Reativar' : 'Cancelar'}
            </button>
          </div>
        `;
      }
    }

    actionContainer.innerHTML = actionHtml;

    // Conectar eventos
    const btnAssumir = actionContainer.querySelector('.btn-assumir');
    if (btnAssumir) btnAssumir.addEventListener('click', () => handleAssumirVagaDireta(slot.id));

    const btnCandidatar = actionContainer.querySelector('.btn-candidatar');
    if (btnCandidatar) btnCandidatar.addEventListener('click', () => handleCandidatarDisputa(slot.id));

    const btnSubstituir = actionContainer.querySelector('.btn-substituir');
    if (btnSubstituir) btnSubstituir.addEventListener('click', () => handleSubstituirVaga(slot.id));

    const btnResolver = actionContainer.querySelector('.btn-resolver-disputa');
    if (btnResolver) btnResolver.addEventListener('click', () => handleEncerrarDisputa(slot.id));

    const btnEditarEscala = actionContainer.querySelector('.btn-editar-escala');
    if (btnEditarEscala) btnEditarEscala.addEventListener('click', () => handleIniciarEdicaoEscala(slot.id));

    const btnCancelEscala = actionContainer.querySelector('.btn-cancelar-escala');
    if (btnCancelEscala) btnCancelEscala.addEventListener('click', () => handleCancelarVagaAdmin(slot.id));
  });
}

function renderMyPanel() {
  if (currentUser && currentUser.tipo === 'OPERADOR') {
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
  
  // Apoiadores válidos para classificação (filtra quem tem score > 0.0 de acordo com o pedido 9)
  const classificados = users
    .filter(u => u.tipo === 'OPERADOR' && u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .map(u => {
      return {
        ...u,
        score: calculateUserPointsGeral(u.id),
        lastDate: getUserLastSupportDate(u.id)
      };
    })
    .filter(u => u.score > 0.0);

  classificados.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
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
          <span class="user-link-history" data-id="${u.id}" style="font-weight: 600; cursor: pointer; text-decoration: underline dotted;" title="Clique para ver o histórico de apoios">${u.nome}</span>
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

  // Mostrar não-classificados no rodapé
  const naoClassificados = users.filter(u => u.tipo === 'OPERADOR' && (u.cargo === 'GPI' || u.cargo === 'OPMAN'));
  if (naoClassificados.length > 0) {
    html += `
      <tr style="background: hsla(222, 47%, 5%, 0.5);"><td colspan="4" style="font-size: 0.7rem; color: var(--text-muted); text-align: center; border-bottom: none; padding: 6px;">Excluídos da Classificação (Art. 6º)</td></tr>
    `;
    naoClassificados.forEach(u => {
      const isCurrentUser = u.id === currentUserId;
      html += `
        <tr class="ranking-row ${isCurrentUser ? 'current-user' : ''}" style="opacity: 0.6;">
          <td><span class="rank-badge rank-other">-</span></td>
          <td>
            <span class="user-link-history" data-id="${u.id}" style="font-weight: 600; cursor: pointer; text-decoration: underline dotted;" title="Clique para ver o histórico de apoios">${u.nome}</span> (${u.cargo})
          </td>
          <td style="text-align: center; font-size: 0.75rem;">Sem Classif.</td>
          <td style="text-align: right;">-</td>
        </tr>
      `;
    });
  }

  rankingTableBody.innerHTML = html;

  // Bind click listeners on links
  rankingTableBody.querySelectorAll('.user-link-history').forEach(el => {
    el.addEventListener('click', () => {
      const uid = el.getAttribute('data-id');
      verHistoricoUsuario(uid);
    });
  });
}

function renderHistoryTable() {
  const historyTableBody = document.getElementById('history-table-body');
  let html = '';

  const filterSelect = document.getElementById('history-filter-user');
  const selectedUserId = filterSelect ? filterSelect.value : 'all';

  // 1. Filtrar histórico
  let filteredHistory = [...history];
  if (selectedUserId !== 'all') {
    filteredHistory = filteredHistory.filter(h => h.usuarioId === selectedUserId);
  }

  // 2. Ordenar histórico
  filteredHistory.sort((a, b) => new Date(b.data) - new Date(a.data));

  // 3. Atualizar painel de sumário individual
  const summaryContainer = document.getElementById('history-user-summary');
  if (selectedUserId === 'all') {
    if (summaryContainer) summaryContainer.style.display = 'none';
  } else {
    if (summaryContainer) {
      const totalSupports = history.filter(h => h.usuarioId === selectedUserId).length;
      const points = calculateUserPointsGeral(selectedUserId);
      const lastSupportDate = getUserLastSupportDate(selectedUserId);
      
      summaryContainer.style.display = 'block';
      summaryContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 12px; font-size: 0.82rem;">
          <div>
            <span style="color: var(--text-muted); display: block;">Apoios no Ano:</span>
            <strong style="font-size: 1.1rem; color: var(--text-primary);">${totalSupports}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Pontuação Acumulada:</span>
            <strong style="font-size: 1.1rem; color: var(--info);">${points.toFixed(4)} pts</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Último Apoio:</span>
            <strong style="font-size: 1.1rem; color: var(--success);">${lastSupportDate ? formatDatePt(lastSupportDate) : 'Nenhum'}</strong>
          </div>
        </div>
      `;
    }
  }

  filteredHistory.forEach(h => {
    const user = users.find(u => u.id === h.usuarioId);
    const regBy = users.find(u => u.id === h.registradoPorId);
    
    const canEdit = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR' || h.usuarioId === currentUser.id || h.registradoPorId === currentUser.id;
    const canDelete = currentUser.tipo === 'ADMINISTRADOR';

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
          <div style="display: inline-flex; gap: 4px; justify-content: center; align-items: center;">
            ${canEdit ? `
              <button class="btn btn-secondary btn-icon-only btn-editar-historico" data-id="${h.id}" title="Editar Registro" style="color: var(--info); padding: 2px 6px;">✏️</button>
            ` : ''}
            ${canDelete ? `
              <button class="btn btn-secondary btn-icon-only btn-excluir-historico" data-id="${h.id}" title="Excluir Registro" style="color: var(--danger); padding: 2px 6px;">✕</button>
            ` : ''}
            ${!canEdit && !canDelete ? '-' : ''}
          </div>
        </td>
      </tr>
    `;
  });

  if (filteredHistory.length === 0) {
    html = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum apoio registrado para a seleção no histórico de 2026.</td></tr>`;
  }

  historyTableBody.innerHTML = html;

  historyTableBody.querySelectorAll('.btn-editar-historico').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.getAttribute('data-id');
      handleIniciarEdicaoHistorico(hid);
    });
  });

  historyTableBody.querySelectorAll('.btn-excluir-historico').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.getAttribute('data-id');
      handleExcluirHistorico(hid);
    });
  });
}

// --- VIEW DE USUÁRIOS E GERENCIAMENTO DE CADASTROS (NOVO) ---

function renderUsersTable() {
  const query = userSearchInput.value.toLowerCase().trim();
  let html = '';

  const filteredUsers = users.filter(u => {
    return u.nome.toLowerCase().includes(query) || u.id.toLowerCase().includes(query) || u.cargo.toLowerCase().includes(query);
  });

  const isOnlyAdmin = currentUser.tipo === 'ADMINISTRADOR';

  // Mostrar ou esconder botão de cadastrar novo usuário com base no perfil de Admin
  const btnCreate = document.getElementById('btn-open-user-modal');
  if (isOnlyAdmin) {
    btnCreate.style.display = 'inline-flex';
  } else {
    btnCreate.style.display = 'none';
  }

  filteredUsers.forEach(u => {
    const score = calculateUserPointsGeral(u.id);
    const hasHistory = history.some(h => h.usuarioId === u.id);
    const scoreText = (u.cargo === 'GPI' || u.cargo === 'OPMAN') ? 'Isento' : `${score.toFixed(4)} pts`;

    html += `
      <tr>
        <td><strong style="color: var(--primary);">${u.id.toUpperCase()}</strong></td>
        <td><span style="font-weight: 600;">${u.nome}</span></td>
        <td>${u.cargo}</td>
        <td>
          <span class="badge ${
            u.tipo === 'ADMINISTRADOR' ? 'badge-cancelled' : 
            u.tipo === 'GERENTE' ? 'badge-pending' : 
            u.tipo === 'SUPERVISOR' ? 'badge-assigned' : 'badge-open'
          }">
            ${u.tipo}
          </span>
        </td>
        <td style="font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-mono);">${u.email}</td>
        <td style="text-align: right; font-weight: bold; color: var(--info);">${scoreText}</td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 4px; justify-content: center; align-items: center;">
            <button class="btn btn-secondary btn-icon-only btn-ver-historico-usuario" data-id="${u.id}" title="Ver Histórico de Apoios" style="padding: 2px 6px; color: var(--success);">📜</button>
            ${isOnlyAdmin ? `
              <button class="btn btn-secondary btn-icon-only btn-editar-usuario" data-id="${u.id}" style="padding: 2px 6px; color: var(--info);">✏️</button>
              <button class="btn btn-secondary btn-icon-only btn-excluir-usuario" data-id="${u.id}" style="padding: 2px 6px; color: var(--danger);" ${hasHistory ? 'title="Não é possível excluir usuário com histórico de apoios" disabled style="opacity: 0.4;"' : ''}>✕</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  });
 
  if (filteredUsers.length === 0) {
    html = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum usuário correspondente à pesquisa.</td></tr>`;
  }
 
  usersTableBody.innerHTML = html;
 
  // Ligar eventos comuns
  usersTableBody.querySelectorAll('.btn-ver-historico-usuario').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-id');
      verHistoricoUsuario(uid);
    });
  });
 
  // Ligar eventos de Admin
  if (isOnlyAdmin) {
    usersTableBody.querySelectorAll('.btn-editar-usuario').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openUserModal('edit', id);
      });
    });
 
    usersTableBody.querySelectorAll('.btn-excluir-usuario').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        handleDeleteUser(id);
      });
    });
  }
}

function openUserModal(mode, id = '') {
  userForm.reset();
  userFormMode.value = mode;

  if (mode === 'add') {
    userModalTitle.textContent = 'Cadastrar Novo Colaborador';
    userFormChave.disabled = false;
    userFormOldChave.value = '';
    userFormNivel.value = 'OPERADOR';
    userFormCargo.value = 'Operador';
  } else if (mode === 'edit') {
    userModalTitle.textContent = 'Editar Colaborador';
    const user = users.find(u => u.id === id);
    if (user) {
      userFormChave.value = user.id.toUpperCase();
      // Não permitir alterar a chave chave primária se tiver histórico para evitar bugs,
      // mas vamos deixar habilitado ou preencher
      userFormChave.disabled = true; // Chave não se edita
      userFormOldChave.value = user.id;
      userFormNome.value = user.nome;
      userFormCargo.value = user.cargo;
      userFormNivel.value = user.tipo;
    }
  }

  userModal.style.display = 'flex';
}

function handleSaveUser(e) {
  e.preventDefault();

  if (currentUser.tipo !== 'ADMINISTRADOR') {
    showBanner('Apenas administradores podem cadastrar ou editar usuários.', 'danger');
    return;
  }

  const mode = userFormMode.value;
  const oldChave = userFormOldChave.value;
  const newChave = userFormChave.value.trim().toUpperCase(); // Normaliza chaves em caixa alta
  const nome = userFormNome.value.trim();
  const cargo = userFormCargo.value.trim();
  const nivel = userFormNivel.value;

  if (!newChave || !nome) {
    showBanner('Preencha os campos obrigatórios.', 'danger');
    return;
  }

  if (mode === 'add') {
    // Verificar se a chave já existe
    const existe = users.some(u => u.id.toUpperCase() === newChave.toUpperCase());
    if (existe) {
      showBanner(`A chave "${newChave}" já está cadastrada para outro colaborador.`, 'danger');
      return;
    }

    const novoUser = {
      id: newChave,
      nome: nome,
      email: `${newChave.toLowerCase()}@rnest.com.br`,
      tipo: nivel,
      cargo: cargo,
      infracoesWA: 0
    };

    users = [...users, novoUser];
    showBanner(`Colaborador ${nome} cadastrado com sucesso!`, 'success');
  } else {
    // Edit mode
    users = users.map(u => {
      if (u.id === oldChave) {
        return {
          ...u,
          nome: nome,
          cargo: cargo,
          tipo: nivel
        };
      }
      return u;
    });

    showBanner(`Dados de ${nome} atualizados com sucesso!`, 'success');
  }

  userModal.style.display = 'none';
  persistChanges();
  renderUsersTable();
}

function handleDeleteUser(chave) {
  if (currentUser.tipo !== 'ADMINISTRADOR') {
    showBanner('Apenas administradores podem excluir usuários.', 'danger');
    return;
  }

  if (chave === currentUserId) {
    showBanner('Você não pode excluir o usuário que está simulando atualmente no topo.', 'danger');
    return;
  }

  const user = users.find(u => u.id === chave);
  const temHistorico = history.some(h => h.usuarioId === chave);
  if (temHistorico) {
    showBanner('Não é possível excluir colaboradores que possuem histórico de apoios.', 'danger');
    return;
  }

  if (confirm(`Tem certeza que deseja excluir o usuário ${user.nome} (${chave.toUpperCase()})?`)) {
    users = users.filter(u => u.id !== chave);
    showBanner(`Usuário ${user.nome} excluído com sucesso.`, 'info');
    persistChanges();
    renderUsersTable();
  }
}

function renderFormGroupsOptions() {
  const selectGrupo = document.getElementById('form-grupo');
  let html = '';
  groups.forEach(g => {
    html += `<option value="${g.id}">${g.nome}</option>`;
  });
  selectGrupo.innerHTML = html;

  const selectRegUsuario = document.getElementById('reg-usuario');
  let userHtml = '';
  users.filter(u => u.tipo === 'OPERADOR').forEach(u => {
    userHtml += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });
  selectRegUsuario.innerHTML = userHtml;
  
  // Re-ligar listener se mudou
  selectRegUsuario.removeEventListener('change', checkLateSubmission);
  selectRegUsuario.addEventListener('change', () => {
    checkLateSubmission();
    updatePointsPreview();
  });

  const selectInfUsuario = document.getElementById('inf-usuario');
  let infHtml = '';
  users.filter(u => u.tipo === 'OPERADOR').forEach(u => {
    infHtml += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });
  selectInfUsuario.innerHTML = infHtml;
}

function renderRulesCheckboxes() {
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

  rulesCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updatePointsPreview);
  });
}

// --- LÓGICA DE PRÉ-VISUALIZAÇÃO DE CÁLCULO ---

function updatePointsPreview() {
  const selectedCbs = rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]:checked');
  const regras = Array.from(selectedCbs).map(cb => cb.value);

  const isLate = isSubmissionLate();
  const isBypassed = regBypassLimit && regBypassLimit.checked;
  const applyPenalty = isLate && !isBypassed;
  
  if (applyPenalty) {
    regPointsPreview.textContent = '2.0000';
    regPointsPreview.style.color = 'var(--danger)';
    regFormulaPreview.textContent = 'R13 Penalidade (Peso 20 / 10 = 2.0)';
    
    rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => {
      cb.disabled = true;
    });
  } else {
    rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => {
      cb.disabled = false;
    });

    if (regras.length === 0) {
      regPointsPreview.textContent = '0.0000';
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

  const supportDate = new Date(supportDateVal + 'T23:59:59');
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00');

  const diffTime = simDate - supportDate;
  const limitMs = 3 * 24 * 60 * 60 * 1000;
  
  return diffTime > limitMs;
}

function checkLateSubmission() {
  const isLate = isSubmissionLate();
  const isBypassed = regBypassLimit && regBypassLimit.checked;
  
  if (isLate) {
    regDateWarning.style.display = 'block';
    if (isBypassed) {
      regDateWarning.textContent = 'ℹ️ Lançamento fora do prazo de 72h, mas a penalidade R13 foi ignorada por ajuste administrativo.';
      regDateWarning.style.color = 'var(--warning)';
    } else {
      regDateWarning.textContent = '⚠️ Lançamento fora do prazo de 72 horas! Será aplicada a penalidade R13 automaticamente.';
      regDateWarning.style.color = 'var(--danger)';
    }
  } else {
    regDateWarning.style.display = 'none';
  }
  updatePointsPreview();
}

// --- EVENT HANDLERS ---

function handleAssumirVagaDireta(slotId) {
  if (!currentUser || currentUser.tipo !== 'OPERADOR') {
    showBanner('Apenas apoiadores podem assumir escalas.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);

  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, status: 'ATRIBUIDO', usuarioId: currentUser.id };
    }
    return s;
  });

  const historyId = 'h_' + Date.now();
  const regras = slot.regrasPrevistas || ['R1'];
  
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

function handleCandidatarDisputa(slotId) {
  if (!currentUser || currentUser.tipo !== 'OPERADOR') {
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

function handleEncerrarDisputa(slotId) {
  const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  if (!isGestor) {
    showBanner('Você não tem permissão para encerrar disputas.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];

  if (list.length === 0) {
    showBanner('Nenhum candidato inscrito nesta vaga.', 'warning');
    return;
  }

  const vencedor = getDisputeWinner(slotId);
  const userVencedor = users.find(u => u.id === vencedor.id);

  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, status: 'ATRIBUIDO', usuarioId: vencedor.id };
    }
    return s;
  });

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
    registradoPorId: currentUser.id
  };

  history = [...history, novoHistorico];

  showBanner(`Disputa encerrada! Vaga atribuída ao líder ${userVencedor.nome} (${vencedor.score.toFixed(2)} pts gerais)`, 'success');
  
  delete candidatos[slotId];
  persistChanges();
}

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
  const isGestor = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  const isBypassed = regBypassLimit && regBypassLimit.checked;
  const applyPenalty = isLate && !isBypassed;

  // Se for operador, aplicar restrições de hierarquia (Art. 9º)
  if (!isGestor) {
    if (regUserId !== currentUser.id) {
      // Tentando registrar para outra pessoa
      if (!isLate) {
        showBanner('Você só pode registrar apoios dentro do prazo para si mesmo. Lançamentos para terceiros só são permitidos após 72h com a penalidade R13 aplicada.', 'danger');
        return;
      }
      // Se estiver atrasado, é permitido mas com R13 forçado
    }
  }

  let regras = [];
  if (applyPenalty) {
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

  if (editingHistoryId) {
    history = history.map(h => {
      if (h.id === editingHistoryId) {
        return {
          ...h,
          usuarioId: regUserId,
          data: regData,
          subgrupo: regSubgrupo,
          regras: regras,
          pontuacao: score,
          dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
          registradoPorId: currentUser.id
        };
      }
      return h;
    });

    const user = users.find(u => u.id === regUserId);
    showBanner(`Lançamento de apoio de ${user.nome} atualizado com sucesso! Nova pontuação: ${score.toFixed(4)} pts.`, 'success');
    editingHistoryId = null;
  } else {
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
  }

  regSubgrupoInput.value = '';
  regDataInput.value = '';
  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => cb.checked = false);
  if (regBypassLimit) regBypassLimit.checked = false;
  checkLateSubmission();

  persistChanges();
  switchView('historico');
}

function handleCancelarVagaAdmin(slotId) {
  const hasPermission = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  if (!hasPermission) {
    showBanner('Você não tem permissão para cancelar ou reativar escalas.', 'danger');
    return;
  }

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

function handleCancelarSlotModal() {
  addModal.style.display = 'none';
  editingSlotId = null;
  const titleEl = document.getElementById('add-modal-title');
  if (titleEl) titleEl.textContent = 'Lançar Nova Solicitação de Apoio';
  addSlotForm.reset();
  modalRulesCheckboxes.querySelectorAll('input[name="modal-prev-regras"]').forEach(cb => cb.checked = false);
}

function handleIniciarEdicaoEscala(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  editingSlotId = slotId;
  addModal.style.display = 'flex';

  const titleEl = document.getElementById('add-modal-title');
  if (titleEl) titleEl.textContent = 'Editar Solicitação de Apoio';

  document.getElementById('form-grupo').value = slot.grupoId;
  document.getElementById('form-subgrupo').value = slot.subgrupo;
  document.getElementById('form-data').value = slot.data;
  document.getElementById('form-horario').value = slot.horario;
  
  const elMotivo = document.getElementById('form-motivo');
  if (elMotivo) {
    elMotivo.value = slot.motivo || '';
  }

  // Preencher as regras previstas
  modalRulesCheckboxes.querySelectorAll('input[name="modal-prev-regras"]').forEach(cb => {
    cb.checked = slot.regrasPrevistas && slot.regrasPrevistas.includes(cb.value);
  });

  // Preencher regra de candidatura (radio buttons)
  const isDisputa = candidatos[slot.id] !== undefined;
  if (isDisputa) {
    document.querySelector('input[name="prioridade"][value="disputa"]').checked = true;
  } else {
    document.querySelector('input[name="prioridade"][value="imediata"]').checked = true;
  }
}

function handleCriarSolicitacaoSlot(e) {
  e.preventDefault();

  const formGrupo = document.getElementById('form-grupo').value;
  const formSubgrupo = document.getElementById('form-subgrupo').value;
  const formData = document.getElementById('form-data').value;
  const formHorario = document.getElementById('form-horario').value;
  const elMotivo = document.getElementById('form-motivo');
  const formMotivo = elMotivo ? elMotivo.value : '';
  const formPrioridade = document.querySelector('input[name="prioridade"]:checked').value;

  const modalCbs = modalRulesCheckboxes.querySelectorAll('input[name="modal-prev-regras"]:checked');
  const regrasPrevistas = Array.from(modalCbs).map(cb => cb.value);

  if (!formSubgrupo || !formData) {
    showBanner('Preencha os campos obrigatórios.', 'danger');
    return;
  }

  if (editingSlotId) {
    // 1. Encontrar o slot original para atualizar o histórico do voluntário se necessário
    const slot = slots.find(s => s.id === editingSlotId);
    if (slot && slot.usuarioId) {
      history = history.map(h => {
        if (h.usuarioId === slot.usuarioId && h.data === slot.data) {
          const finalRegras = h.regras.includes('R13') ? ['R13'] : regrasPrevistas;
          return {
            ...h,
            data: formData,
            subgrupo: formSubgrupo,
            regras: finalRegras,
            pontuacao: calculateSupportScore(finalRegras)
          };
        }
        return h;
      });
    }

    // 2. Atualizar o slot
    slots = slots.map(s => {
      if (s.id === editingSlotId) {
        const updated = {
          ...s,
          grupoId: formGrupo,
          subgrupo: formSubgrupo,
          data: formData,
          horario: formHorario,
          regrasPrevistas: regrasPrevistas
        };
        if (formMotivo) {
          updated.motivo = formMotivo;
        } else {
          delete updated.motivo;
        }
        return updated;
      }
      return s;
    });

    // 3. Gerenciar disputa
    if (formPrioridade === 'disputa') {
      if (candidatos[editingSlotId] === undefined) {
        candidatos[editingSlotId] = [];
      }
    } else {
      delete candidatos[editingSlotId];
    }

    showBanner('Escala de apoio atualizada!', 'success');
    editingSlotId = null;
    const titleEl = document.getElementById('add-modal-title');
    if (titleEl) titleEl.textContent = 'Lançar Nova Solicitação de Apoio';
  } else {
    // Criar novo slot
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

    showBanner('Nova escala de apoio cadastrada!', 'success');
  }

  addModal.style.display = 'none';

  // Limpar formulário
  document.getElementById('form-subgrupo').value = '';
  document.getElementById('form-data').value = '';
  if (elMotivo) elMotivo.value = '';
  modalRulesCheckboxes.querySelectorAll('input[name="modal-prev-regras"]').forEach(cb => cb.checked = false);

  persistChanges();
}

function handleAplicarInfracao(e) {
  e.preventDefault();

  if (currentUser.tipo !== 'ADMINISTRADOR' && currentUser.tipo !== 'GERENTE') {
    showBanner('Apenas Administradores e Gerentes podem aplicar infrações de WhatsApp.', 'danger');
    return;
  }

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

function handleExcluirHistorico(historyId) {
  const item = history.find(h => h.id === historyId);
  const user = users.find(u => u.id === item.usuarioId);

  history = history.filter(h => h.id !== historyId);
  showBanner(`Registro do dia ${formatDatePt(item.data)} de ${user?.nome || 'colaborador'} excluído do histórico.`, 'info');
  
  persistChanges();
}

// --- INTEGRAÇÃO WHATSAPP ---
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
          userText = '';
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
