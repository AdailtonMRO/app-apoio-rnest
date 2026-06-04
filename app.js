import { getStoredData, saveStoredData, INITIAL_USERS } from './data.js';

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let users = [];
let groups = [];
let slots = [];
let currentUser = null;
let currentUserId = '1'; // Syan por padrão
let activeTab = 'all';

// Candidatos a vagas em disputa
// { slotId: [userId1, userId2] }
let candidatos = {
  's3': ['8', '10'], // Alan (6 apoios), Adailton (8 apoios)
  's5': ['7'],       // Yasmin (5 apoios)
  's17': ['1', '9']  // Syan (0 apoios), Janderson (7 apoios)
};

// --- ELEMENTOS DO DOM ---
const roleSelect = document.getElementById('role-select');
const btnResetDemo = document.getElementById('btn-reset-demo');
const tabContainer = document.getElementById('tab-container');
const adminActionsBar = document.getElementById('admin-actions-bar');
const slotsCount = document.getElementById('slots-count');
const slotsGrid = document.getElementById('slots-grid');
const myPanelWidget = document.getElementById('my-panel-widget');
const rankingTableBody = document.getElementById('ranking-table-body');
const notificationContainer = document.getElementById('notification-container');

// Modais
const addModal = document.getElementById('add-modal');
const btnOpenAddModal = document.getElementById('btn-open-add-modal');
const btnCloseAddModal = document.getElementById('btn-close-add-modal');
const btnCancelAddModal = document.getElementById('btn-cancel-add-modal');
const addSlotForm = document.getElementById('add-slot-form');

const whatsappModal = document.getElementById('whatsapp-modal');
const btnOpenWhatsappModal = document.getElementById('btn-open-whatsapp-modal');
const btnCloseWhatsappModal = document.getElementById('btn-close-whatsapp-modal');
const btnCancelWhatsappModal = document.getElementById('btn-cancel-whatsapp-modal');
const whatsappExportArea = document.getElementById('whatsapp-export-area');
const btnCopyWhatsapp = document.getElementById('btn-copy-whatsapp');

// --- INICIALIZAÇÃO ---
function init() {
  // Carregar dados
  loadData();

  // Adicionar Event Listeners Globais
  roleSelect.addEventListener('change', handleRoleChange);
  btnResetDemo.addEventListener('click', resetDemo);
  
  // Eventos de Modais
  btnOpenAddModal.addEventListener('click', () => addModal.style.display = 'flex');
  btnCloseAddModal.addEventListener('click', () => addModal.style.display = 'none');
  btnCancelAddModal.addEventListener('click', () => addModal.style.display = 'none');
  addSlotForm.addEventListener('submit', handleCriarEscala);

  btnOpenWhatsappModal.addEventListener('click', openWhatsappExporter);
  btnCloseWhatsappModal.addEventListener('click', () => whatsappModal.style.display = 'none');
  btnCancelWhatsappModal.addEventListener('click', () => whatsappModal.style.display = 'none');
  btnCopyWhatsapp.addEventListener('click', handleCopyClipboard);

  // Inicializar opções do formulário
  renderFormGroupsOptions();

  // Fechar modais ao clicar fora
  window.addEventListener('click', (e) => {
    if (e.target === addModal) addModal.style.display = 'none';
    if (e.target === whatsappModal) whatsappModal.style.display = 'none';
  });

  // Render inicial
  renderAll();
  showBanner('Simulação carregada! Altere os perfis no topo para testar as regras.', 'info');
}

function loadData() {
  const data = getStoredData();
  users = data.users;
  groups = data.groups;
  slots = data.slots;
  
  // Carregar usuário ativo
  currentUser = users.find(u => u.id === currentUserId) || users[0];
  currentUserId = currentUser.id;
}

function persistChanges() {
  saveStoredData({ users, groups, slots });
  renderAll();
}

// --- RENDERIZADORES ---

function renderAll() {
  renderRoleSelect();
  renderTabs();
  renderAdminBar();
  renderSlots();
  renderMyPanel();
  renderRanking();
}

function renderRoleSelect() {
  let html = '';
  
  html += '<optgroup label="Colaboradores (Apoiadores)">';
  users.filter(u => u.tipo === 'APOIADOR').forEach(u => {
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome} (Apoios: ${u.apoiosAno} no Ano / ${countUserSupportsInMonth(u.id, '2026-06-01')} no Mês)
    </option>`;
  });
  html += '</optgroup>';
  
  html += '<optgroup label="Gestão">';
  users.filter(u => u.tipo !== 'APOIADOR').forEach(u => {
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome} (${u.tipo})
    </option>`;
  });
  html += '</optgroup>';
  
  roleSelect.innerHTML = html;
}

function renderTabs() {
  let html = `<button class="tab-btn ${activeTab === 'all' ? 'active' : ''}" data-tab="all">Todos os Apoios</button>`;
  
  groups.forEach(g => {
    const label = g.nome.replace('Apoios ', '').replace('Apoio ', '');
    html += `<button class="tab-btn ${activeTab === g.id ? 'active' : ''}" data-tab="${g.id}">${label}</button>`;
  });
  
  tabContainer.innerHTML = html;

  // Add listeners
  tabContainer.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      renderTabs();
      renderSlots();
    });
  });
}

function renderAdminBar() {
  if (currentUser.tipo === 'ADMIN' || currentUser.tipo === 'GERENTE') {
    adminActionsBar.style.display = 'flex';
    
    const btnCreate = document.getElementById('btn-open-add-modal');
    if (currentUser.tipo === 'ADMIN') {
      btnCreate.style.display = 'inline-flex';
    } else {
      btnCreate.style.display = 'none';
    }
  } else {
    adminActionsBar.style.display = 'none';
  }
}

function renderSlots() {
  let filtered = [...slots];
  
  // Ordenar por data
  filtered.sort((a, b) => new Date(a.data) - new Date(b.data));

  if (activeTab !== 'all') {
    filtered = filtered.filter(s => s.grupoId === activeTab);
  }

  slotsCount.textContent = `${filtered.length} vaga(s) encontrada(s)`;

  if (filtered.length === 0) {
    slotsGrid.innerHTML = `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
        Nenhum apoio agendado para esta categoria.
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(slot => {
    const isDisputa = candidatos[slot.id] !== undefined;
    const candList = candidatos[slot.id] || [];
    const liderDisputa = getDisputeWinner(slot.id);
    const apontee = users.find(u => u.id === slot.usuarioId);
    const userMonthSupports = slot.usuarioId ? countUserSupportsInMonth(slot.usuarioId, slot.data) : 0;
    
    const cardStatusClass = isDisputa ? 'pendente' : slot.status.toLowerCase();
    
    html += `
      <div class="slot-card glass-panel status-${cardStatusClass}">
        <div class="slot-meta">
          <span class="slot-subgrupo">${slot.subgrupo}</span>
          ${isDisputa ? `
            <span class="badge badge-pending">Janela de Prioridade</span>
          ` : `
            <span class="badge badge-${slot.status.toLowerCase()}">
              ${slot.status === 'LIVRE' ? 'Disponível' : 
                slot.status === 'PENDENTE_APROVACAO' ? 'Aguardando Gerência' : 
                slot.status === 'CANCELADO' ? 'Cancelado' : 'Preenchido'}
            </span>
          `}
        </div>

        <div class="slot-schedule">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${formatDate(slot.data)}</span>
          <span>•</span>
          <span>Turno: ${slot.horario}</span>
        </div>

        ${slot.motivo ? `
          <div class="slot-reason">
            <strong>Motivo:</strong> ${slot.motivo}
          </div>
        ` : ''}

        <!-- Candidatos se for Disputa -->
        ${isDisputa ? `
          <div style="background: hsla(222, 47%, 9%, 0.6); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">
              👥 Candidatos na disputa (${candList.length}):
            </span>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${candList.map((cid, i) => {
                const u = users.find(user => user.id === cid);
                const eLider = liderDisputa && liderDisputa.id === cid;
                return `
                  <div style="font-size: 0.75rem; display: flex; justify-content: space-between; color: ${eLider ? 'var(--success)' : 'var(--text-secondary)'}; font-weight: ${eLider ? 700 : 400};">
                    <span>${i+1}. ${u?.nome} ${eLider ? '🏆 (Líder)' : ''}</span>
                    <span>${u?.apoiosAno} apoios/ano</span>
                  </div>
                `;
              }).join('')}
              ${candList.length === 0 ? `
                <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
                  Nenhum inscrito. Seja o primeiro!
                </span>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Detalhes do Escalonado se confirmado/pendente -->
        ${!isDisputa && slot.usuarioId ? `
          <div class="slot-details">
            <div class="slot-assignee">
              <div>
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Apoiador escalado:</span>
                <span class="assignee-name">${apontee?.nome}</span>
              </div>
              <span class="assignee-count">
                ${userMonthSupports} apoios no mês
              </span>
            </div>
            ${slot.observacao ? `
              <div class="slot-note">
                💡 Obs: ${slot.observacao}
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- AÇÕES -->
        <div class="slot-actions" data-slot-id="${slot.id}">
          <!-- Preenchido dinamicamente abaixo -->
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

    // 1. Vaga Livre (Inscrição Imediata)
    if (slot.status === 'LIVRE' && !isDisputa && currentUser.tipo === 'APOIADOR') {
      actionHtml = `<button class="btn btn-primary btn-assumir" style="width: 100%;">🟢 Assumir Apoio Rápido</button>`;
    }
    // 2. Fila de Prioridade ativa
    else if (isDisputa && currentUser.tipo === 'APOIADOR') {
      const jaInscrito = candList.includes(currentUser.id);
      actionHtml = `
        <button class="btn btn-secondary btn-candidatar" style="width: 100%; border-color: var(--warning); color: var(--warning);" ${jaInscrito ? 'disabled' : ''}>
          ${jaInscrito ? '✓ Candidatado' : '⏳ Candidatar-se (Entrar na Fila)'}
        </button>
      `;
    }
    // 3. Fechar disputa (Admin)
    if (isDisputa && currentUser.tipo === 'ADMIN') {
      actionHtml += `
        <button class="btn btn-primary btn-resolver-disputa" style="width: 100%; background: var(--warning); color: black; margin-top: 8px;">
          🔒 Fechar Janela e Atribuir Vencedor
        </button>
      `;
    }
    // 4. Desistir de vaga própria
    if (slot.status === 'ATRIBUIDO' && slot.usuarioId === currentUser.id) {
      actionHtml = `<button class="btn btn-danger btn-desistir" style="width: 100%;">🔴 Desistir do Apoio</button>`;
    }
    // 5. Decisão do Gerente
    if (slot.status === 'PENDENTE_APROVACAO' && currentUser.tipo === 'GERENTE') {
      actionHtml = `
        <div style="display: flex; gap: 8px; width: 100%;">
          <button class="btn btn-primary btn-aprovar" style="flex: 1; background: var(--success);">✓ Aprovar</button>
          <button class="btn btn-danger btn-recusar" style="flex: 1;">✕ Recusar</button>
        </div>
      `;
    }
    // 6. Cancelar escala (Admin)
    if (currentUser.tipo === 'ADMIN') {
      actionHtml += `
        <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
          <button class="btn btn-secondary btn-icon-only btn-cancelar-escala" style="font-size: 0.75rem; padding: 4px 8px; color: var(--danger);">
            ⚠️ ${slot.status === 'CANCELADO' ? 'Reativar Slot' : 'Cancelar Slot'}
          </button>
        </div>
      `;
    }

    actionContainer.innerHTML = actionHtml;

    // Attach local events
    const btnAssumir = actionContainer.querySelector('.btn-assumir');
    if (btnAssumir) btnAssumir.addEventListener('click', () => handleAssumirVagaDireta(slot.id));

    const btnCandidatar = actionContainer.querySelector('.btn-candidatar');
    if (btnCandidatar) btnCandidatar.addEventListener('click', () => handleCandidatarDisputa(slot.id));

    const btnResolver = actionContainer.querySelector('.btn-resolver-disputa');
    if (btnResolver) btnResolver.addEventListener('click', () => handleEncerrarDisputa(slot.id));

    const btnDesistir = actionContainer.querySelector('.btn-desistir');
    if (btnDesistir) btnDesistir.addEventListener('click', () => handleDesistirVaga(slot.id));

    const btnAprovar = actionContainer.querySelector('.btn-aprovar');
    if (btnAprovar) btnAprovar.addEventListener('click', () => handleDecisaoGerencial(slot.id, true));

    const btnRecusar = actionContainer.querySelector('.btn-recusar');
    if (btnRecusar) btnRecusar.addEventListener('click', () => handleDecisaoGerencial(slot.id, false));

    const btnCancelEscala = actionContainer.querySelector('.btn-cancelar-escala');
    if (btnCancelEscala) btnCancelEscala.addEventListener('click', () => handleCancelarVagaAdmin(slot.id));
  });
}

function renderMyPanel() {
  if (currentUser && currentUser.tipo === 'APOIADOR') {
    myPanelWidget.style.display = 'block';
    const mesSupports = countUserSupportsInMonth(currentUser.id, '2026-06-01');
    const atingiuLimite = mesSupports >= 3;
    
    myPanelWidget.innerHTML = `
      <h3 class="widget-title">👤 Meu Painel</h3>
      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem;">
        <div>
          <span style="color: var(--text-muted); display: block;">Nome:</span>
          <strong>${currentUser.nome}</strong>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <span style="color: var(--text-muted); display: block;">Apoios no Mês:</span>
            <strong style="font-size: 1.25rem; color: ${atingiuLimite ? 'var(--warning)' : 'var(--success)'}">
              ${mesSupports} / 3
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Apoios no Ano:</span>
            <strong style="font-size: 1.25rem; color: var(--text-primary)">
              ${currentUser.apoiosAno}
            </strong>
          </div>
        </div>

        ${atingiuLimite ? `
          <div style="font-size: 0.75rem; color: var(--warning); background: var(--warning-glow); padding: 8px; border-radius: 4px; border: 1px solid hsla(38, 92%, 50%, 0.2)">
            ⚠️ Você atingiu o limite de 3 apoios. Próximas vagas exigirão aprovação de gerente!
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
  
  const sorted = [...users]
    .filter(u => u.tipo === 'APOIADOR')
    .sort((a, b) => a.apoiosAno - b.apoiosAno);
    
  sorted.forEach((u, index) => {
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
        <td>${u.nome} ${isCurrentUser ? '(Você)' : ''}</td>
        <td style="text-align: right; font-weight: bold;">${u.apoiosAno}</td>
      </tr>
    `;
  });
  
  rankingTableBody.innerHTML = html;
}

function renderFormGroupsOptions() {
  const select = document.getElementById('form-grupo');
  let html = '';
  groups.forEach(g => {
    html += `<option value="${g.id}">${g.nome}</option>`;
  });
  select.innerHTML = html;
}

// --- EVENT HANDLERS DE SIMULAÇÃO ---

function handleRoleChange(e) {
  currentUserId = e.target.value;
  currentUser = users.find(u => u.id === currentUserId);
  renderAll();
}

function resetDemo() {
  localStorage.removeItem('rnest_users');
  localStorage.removeItem('rnest_groups');
  localStorage.removeItem('rnest_slots');
  
  candidatos = {
    's3': ['8', '10'],
    's5': ['7'],
    's17': ['1', '9']
  };
  
  currentUserId = '1';
  loadData();
  renderAll();
  showBanner('Dados da simulação restaurados com sucesso!', 'info');
}

// --- CANDIDATURA DIRETA ---
function handleAssumirVagaDireta(slotId) {
  if (!currentUser || currentUser.tipo !== 'APOIADOR') {
    showBanner('Apenas apoiadores podem assumir escalas.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  const apoiosNoMes = countUserSupportsInMonth(currentUser.id, slot.data);

  let novoStatus = 'ATRIBUIDO';
  let requerAprovacao = false;

  if (apoiosNoMes >= 3) {
    novoStatus = 'PENDENTE_APROVACAO';
    requerAprovacao = true;
  }

  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, status: novoStatus, usuarioId: currentUser.id, requerAprovacao };
    }
    return s;
  });

  if (novoStatus === 'ATRIBUIDO') {
    users = users.map(u => {
      if (u.id === currentUser.id) {
        return {
          ...u,
          apoiosMes: u.apoiosMes + 1,
          apoiosAno: u.apoiosAno + 1
        };
      }
      return u;
    });
    showBanner(`Apoio assumido com sucesso para ${formatDate(slot.data)}!`, 'success');
  } else {
    showBanner(`Inscrição enviada! Como você já tem ${apoiosNoMes} apoios no mês, requer aprovação do gerente.`, 'warning');
  }

  persistChanges();
}

// --- DISPUTA E PRIORIDADE ---
function handleCandidatarDisputa(slotId) {
  if (!currentUser || currentUser.tipo !== 'APOIADOR') {
    showBanner('Apenas apoiadores podem se candidatar.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];
  
  if (list.includes(currentUser.id)) {
    showBanner('Você já está inscrito nesta disputa.', 'warning');
    return;
  }

  candidatos[slotId] = [...list, currentUser.id];
  showBanner(`Inscrito na disputa para a vaga do dia ${formatDate(slot.data)}!`, 'success');
  renderSlots();
}

function handleEncerrarDisputa(slotId) {
  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];

  if (list.length === 0) {
    showBanner('Nenhum candidato inscrito nesta vaga.', 'warning');
    return;
  }

  const vencedor = getDisputeWinner(slot.id);
  const apoiosNoMes = countUserSupportsInMonth(vencedor.id, slot.data);
  const novoStatus = apoiosNoMes >= 3 ? 'PENDENTE_APROVACAO' : 'ATRIBUIDO';

  slots = slots.map(s => {
    if (s.id === slotId) {
      return {
        ...s,
        status: novoStatus,
        usuarioId: vencedor.id,
        requerAprovacao: apoiosNoMes >= 3
      };
    }
    return s;
  });

  if (novoStatus === 'ATRIBUIDO') {
    users = users.map(u => {
      if (u.id === vencedor.id) {
        return {
          ...u,
          apoiosMes: u.apoiosMes + 1,
          apoiosAno: u.apoiosAno + 1
        };
      }
      return u;
    });
    showBanner(`Disputa encerrada! Vaga atribuída a ${vencedor.nome} (Prioridade: ${vencedor.apoiosAno} apoios no ano).`, 'success');
  } else {
    showBanner(`Disputa encerrada! Vencedor: ${vencedor.nome}, mas requer aprovação gerencial (> 3 apoios no mês).`, 'warning');
  }

  delete candidatos[slotId];
  persistChanges();
}

// --- DESISTÊNCIA ---
function handleDesistirVaga(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (slot.usuarioId !== currentUser.id && currentUser.tipo !== 'ADMIN') {
    showBanner('Você só pode desistir de escalas atribuídas a você.', 'danger');
    return;
  }

  const apontee = users.find(u => u.id === slot.usuarioId);

  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, status: 'LIVRE', usuarioId: null, requerAprovacao: false };
    }
    return s;
  });

  if (slot.status === 'ATRIBUIDO' && apontee) {
    users = users.map(u => {
      if (u.id === apontee.id) {
        return {
          ...u,
          apoiosMes: Math.max(0, u.apoiosMes - 1),
          apoiosAno: Math.max(0, u.apoiosAno - 1)
        };
      }
      return u;
    });
  }

  showBanner('Você desistiu da vaga de apoio.', 'info');
  persistChanges();
}

// --- GERENTE ---
function handleDecisaoGerencial(slotId, aprovado) {
  const slot = slots.find(s => s.id === slotId);
  const user = users.find(u => u.id === slot.usuarioId);

  if (aprovado) {
    slots = slots.map(s => {
      if (s.id === slotId) return { ...s, status: 'ATRIBUIDO', requerAprovacao: false };
      return s;
    });
    if (user) {
      users = users.map(u => {
        if (u.id === user.id) {
          return {
            ...u,
            apoiosMes: u.apoiosMes + 1,
            apoiosAno: u.apoiosAno + 1
          };
        }
        return u;
      });
    }
    showBanner(`Apoio de ${user?.nome} aprovado pelo gerente.`, 'success');
  } else {
    slots = slots.map(s => {
      if (s.id === slotId) return { ...s, status: 'LIVRE', usuarioId: null, requerAprovacao: false };
      return s;
    });
    showBanner(`Apoio de ${user?.nome} rejeitado pelo gerente. A vaga está livre novamente.`, 'danger');
  }

  persistChanges();
}

// --- ADMIN CANCELA ESCALA ---
function handleCancelarVagaAdmin(slotId) {
  const slot = slots.find(s => s.id === slotId);
  const statusAtual = slot.status;

  slots = slots.map(s => {
    if (s.id === slotId) {
      return {
        ...s,
        status: statusAtual === 'CANCELADO' ? 'LIVRE' : 'CANCELADO',
        usuarioId: null,
        requerAprovacao: false
      };
    }
    return s;
  });

  if (statusAtual === 'ATRIBUIDO' && slot.usuarioId) {
    users = users.map(u => {
      if (u.id === slot.usuarioId) {
        return {
          ...u,
          apoiosMes: Math.max(0, u.apoiosMes - 1),
          apoiosAno: Math.max(0, u.apoiosAno - 1)
        };
      }
      return u;
    });
  }

  showBanner(statusAtual === 'CANCELADO' ? 'Slot reativado.' : 'Escala de apoio cancelada.', 'info');
  persistChanges();
}

// --- ADMIN CRIA ESCALA ---
function handleCriarEscala(e) {
  e.preventDefault();
  
  const formGrupo = document.getElementById('form-grupo').value;
  const formSubgrupo = document.getElementById('form-subgrupo').value;
  const formData = document.getElementById('form-data').value;
  const formHorario = document.getElementById('form-horario').value;
  const formMotivo = document.getElementById('form-motivo').value;
  const formPrioridade = document.querySelector('input[name="prioridade"]:checked').value;

  if (!formSubgrupo || !formData) {
    showBanner('Por favor preencha todos os campos.', 'danger');
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
    requerAprovacao: false
  };

  if (formMotivo) {
    novoSlot.motivo = formMotivo;
  }

  slots = [...slots, novoSlot];
  
  if (formPrioridade === 'disputa') {
    candidatos[slotId] = [];
  }

  addModal.style.display = 'none';
  showBanner('Novo apoio criado na escala!', 'success');
  
  // Reset form
  document.getElementById('form-subgrupo').value = '';
  document.getElementById('form-data').value = '';
  document.getElementById('form-motivo').value = '';
  
  persistChanges();
}

// --- WHATSAPP TEMPLATE EXPORTER ---
function openWhatsappExporter() {
  const textarea = document.getElementById('whatsapp-export-area');
  textarea.value = generateWhatsappTemplate();
  whatsappModal.style.display = 'flex';
}

function generateWhatsappTemplate() {
  let output = '';

  groups.forEach(group => {
    const groupSlots = slots.filter(s => s.grupoId === group.id);
    if (groupSlots.length === 0) return;

    output += `🚦*${group.nome}*\n\n`;

    // Agrupar slots por subgrupo
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
          userText = ''; // Vazia, aguardando disputa
        } else if (s.status === 'PENDENTE_APROVACAO') {
          userText = `${u?.nome || ''} (Aguardando Aprovação Gerencial)`;
        } else if (s.status === 'ATRIBUIDO') {
          const userMonthCount = countUserSupportsInMonth(s.usuarioId, s.data);
          userText = `${u?.nome || ''} (${userMonthCount})`;
          if (s.observacao) {
            userText += ` (${s.observacao})`;
          }
        }

        output += `${formatDate(s.data)} - ${s.horario}: ${userText}\n`;
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function countUserSupportsInMonth(userId, dateStr) {
  const month = dateStr.split('-')[1]; // Ex: "06"
  return slots.filter(s => s.usuarioId === userId && s.status === 'ATRIBUIDO' && s.data.split('-')[1] === month).length;
}

function getDisputeWinner(slotId) {
  const list = candidatos[slotId] || [];
  if (list.length === 0) return null;

  const listWithDetails = list.map((uid, index) => {
    const u = users.find(user => user.id === uid);
    return { id: uid, nome: u.nome, apoiosAno: u.apoiosAno, index };
  });

  listWithDetails.sort((a, b) => {
    if (a.apoiosAno !== b.apoiosAno) {
      return a.apoiosAno - b.apoiosAno; // menos apoios ganha
    }
    return a.index - b.index; // mais antigo ganha
  });

  return listWithDetails[0];
}

function showBanner(message, type = 'success') {
  const banner = document.createElement('div');
  banner.className = `notification-banner banner-${type}`;
  banner.innerHTML = `
    <span>${message}</span>
    <button style="background: transparent; border: none; cursor: pointer; color: inherit; font-weight: bold; margin-left: 10px;">✕</button>
  `;
  
  notificationContainer.appendChild(banner);
  
  // Fade out
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.5s ease';
    setTimeout(() => banner.remove(), 500);
  }, 4000);

  banner.querySelector('button').addEventListener('click', () => {
    banner.remove();
  });
}

// Rodar na carga
document.addEventListener('DOMContentLoaded', init);
// Se já estiver carregado (módulos às vezes disparam após DOMContentLoaded)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  init();
}
