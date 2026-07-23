import { getStoredData, saveStoredData, SUPPORT_RULES, INITIAL_USERS, INITIAL_GROUPS, INITIAL_SLOTS, INITIAL_HISTORY, AREAS_FUNCOES, SHIFT_CYCLE, GROUP_START_DATES, DEFAULT_CONFIG, CAUSAS_RAIZ_APOIO } from './data.js';
import { isFirebaseEnabled, loginWithGoogle, logout, onAuthChange, syncDocument, updateDocument, getNotificationToken, orgId } from './firebase-db.js';

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let users = [];
let groups = [];
let slots = [];
let history = [];
let autotrocas = [];

// Perfil simulado ativo
let currentUserId = 'AB2U'; // Syan Addy Vasconcellos por padrão (Operador)
let currentUser = null;
let adminViewMode = 'admin'; // 'admin' ou 'operator'
let authenticatedGoogleUser = null;
let dbConnected = false;
let connectionTimeout = null;

// Configuração dinâmica parametrizada
let currentConfig = { ...DEFAULT_CONFIG };
let supportRules = [ ...SUPPORT_RULES ];

// Acompanha quais coleções foram carregadas com sucesso do Firebase
let syncedDocs = {
  users: false,
  groups: false,
  slots: false,
  history: false,
  candidatos: false,
  autotrocas: false,
  config: false
};

function areAllDocsSynced() {
  return syncedDocs.users && syncedDocs.groups && syncedDocs.slots && syncedDocs.history && syncedDocs.candidatos && syncedDocs.autotrocas && syncedDocs.config;
}

// Funções Auxiliares de Permissão
function isCurrentUserAdminOnly() {
  if (!currentUser) return false;
  if (currentUser.tipo === 'ADMINISTRADOR') {
    return adminViewMode === 'admin';
  }
  return false;
}

function isCurrentUserAdminOrSupervisor() {
  if (!currentUser) return false;
  if (currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'SUPERVISOR') {
    return adminViewMode === 'admin';
  }
  return false;
}

function isCurrentUserGestor() {
  if (!currentUser) return false;
  const isGestorRole = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  if (isGestorRole) {
    return adminViewMode === 'admin';
  }
  return false;
}

function isCurrentUserOperador() {
  if (!currentUser) return false;
  const isGestorRole = currentUser.tipo === 'ADMINISTRADOR' || currentUser.tipo === 'GERENTE' || currentUser.tipo === 'SUPERVISOR';
  if (isGestorRole) {
    return adminViewMode === 'operator';
  }
  return currentUser.tipo === 'OPERADOR';
}

function getDefaultAreasForUser(user) {
  const activeAreas = currentConfig.areasFuncoes || AREAS_FUNCOES;
  const userAreas = [];
  
  if (user.tipo === 'SUPERVISOR' || (user.cargo && user.cargo.toLowerCase().includes('supervisor'))) {
    if (activeAreas['SUPERVISORES']) {
      return [...activeAreas['SUPERVISORES']];
    }
  }
  
  const cargoLower = (user.cargo || '').toLowerCase();
  const nomeLower = (user.nome || '').toLowerCase();
  
  // Buscar correspondência de palavras chave nas áreas existentes
  Object.keys(activeAreas).forEach(grupo => {
    activeAreas[grupo].forEach(area => {
      const areaLower = area.toLowerCase();
      if (
        (cargoLower && areaLower.split(' ').some(word => word.length > 3 && cargoLower.includes(word))) ||
        (nomeLower && areaLower.split(' ').some(word => word.length > 3 && nomeLower.includes(word)))
      ) {
        userAreas.push(area);
      }
    });
  });
  
  if (userAreas.length > 0) return userAreas;
  
  // Fallback baseado nos padrões antigos (caso existam nas novas áreas)
  if (cargoLower.includes('elétrica') || cargoLower.includes('eletrica') || nomeLower.includes('elétrica') || nomeLower.includes('eletrica')) {
    const list = ['CAMPO ELÉTRICA', 'PAINEL ELÉTRICO', 'APOIO TÉCNICO ELÉTRICA'];
    const valid = list.filter(item => Object.values(activeAreas).flat().includes(item));
    if (valid.length > 0) return valid;
  }
  if (cargoLower.includes('térmica') || cargoLower.includes('termica') || cargoLower.includes('caldeira') || nomeLower.includes('térmica') || nomeLower.includes('termica')) {
    const list = ['CALDEIRAS', 'AUXILIARES', 'PAINEL TÉRMICO'];
    const valid = list.filter(item => Object.values(activeAreas).flat().includes(item));
    if (valid.length > 0) return valid;
  }
  if (cargoLower.includes('águas') || cargoLower.includes('aguas') || cargoLower.includes('etdi') || nomeLower.includes('águas') || nomeLower.includes('aguas')) {
    const list = ['TORRES', 'ETDI', 'ÁGUAS', 'PAINEL ÁGUAS'];
    const valid = list.filter(item => Object.values(activeAreas).flat().includes(item));
    if (valid.length > 0) return valid;
  }
  
  // Se nada funcionar, pega as primeiras áreas disponíveis
  const allAvailableAreas = Object.values(activeAreas).flat();
  if (allAvailableAreas.length > 0) {
    return allAvailableAreas.slice(0, 2);
  }
  
  return [];
}

function getDefaultGrupoTrabalho(user) {
  if (user.tipo === 'ADMINISTRADOR' || (user.cargo && user.cargo.toLowerCase().includes('administrador'))) {
    return 'adm';
  }
  if (user.tipo === 'SUPERVISOR' || (user.cargo && user.cargo.toLowerCase().includes('supervisor'))) {
    return 'adm';
  }
  const charCodeSum = Array.from(user.id || '').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const groups = ['grupo_a', 'grupo_b', 'grupo_c', 'grupo_d', 'grupo_e'];
  return groups[charCodeSum % groups.length];
}

function getDaysDifference(date1Str, date2Str) {
  const d1 = new Date(date1Str + 'T00:00:00');
  const d2 = new Date(date2Str + 'T00:00:00');
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getSimulatedCurrentDateTime() {
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + 
                  String(now.getMinutes()).padStart(2, '0') + ':' + 
                  String(now.getSeconds()).padStart(2, '0');
  return new Date(simulatedCurrentDate + 'T' + timeStr);
}

function getSlotStartDateTime(slot) {
  const horaVal = slot.horaInicio || ((slot.horario && slot.horario.includes('19')) ? '19:00' : '07:00');
  return new Date(slot.data + 'T' + horaVal + ':00');
}

function isLessThan24HoursBefore(slot) {
  const now = getSimulatedCurrentDateTime();
  const slotStart = getSlotStartDateTime(slot);
  const diffMs = slotStart.getTime() - now.getTime();
  return diffMs < 24 * 60 * 60 * 1000;
}

function getGroupShiftForDate(grupoId, dateStr) {
  if (!grupoId) return 'F';
  if (grupoId === 'adm') {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0 = Sunday, 6 = Saturday
    if (day === 0 || day === 6) return 'F';
    return 'ADM';
  }
  // Tenta encontrar a dataInicio dinâmica do grupo na base
  const group = groups.find(g => g.id === grupoId);
  const startDateStr = (group && group.dataInicio) || GROUP_START_DATES[grupoId];
  if (!startDateStr) return 'F';
  
  const diffDays = getDaysDifference(startDateStr, dateStr);
  let cycleDay = diffDays % 35;
  if (cycleDay < 0) cycleDay += 35;
  
  return SHIFT_CYCLE[cycleDay];
}


function renderAreasCheckboxList(containerId, checkboxName) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const activeAreas = currentConfig.areasFuncoes || AREAS_FUNCOES;
  let html = '';
  Object.keys(activeAreas).forEach(grupo => {
    html += `
      <div style="margin-bottom: 8px;">
        <div style="font-weight: bold; color: var(--primary); margin-bottom: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; font-size: 0.85rem;">${grupo}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding-left: 6px;">
          ${activeAreas[grupo].map(area => `
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; cursor: pointer; color: var(--text-secondary); margin-bottom: 0;">
              <input type="checkbox" name="${checkboxName}" value="${area}" style="width: auto;">
              <span>${area}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Abas de visualização principal e escalas
let currentView = 'escalas'; // 'escalas', 'registro', 'historico', 'usuarios'
let activeTab = 'all';
let escalaDateFilter = 'future'; // 'future' ou 'past'
let editingHistoryId = null;
let editingSlotId = null;

// Data atual (formato YYYY-MM-DD em fuso horário local)
function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
let simulatedCurrentDate = getTodayStr();

// Candidaturas a vagas em disputa (Iniciada vazia para apenas Acesso Direto)
let candidatos = {};
let currentModalSlotId = null;
let currentModalIsSub = false;

// --- ELEMENTOS DO DOM ---
const roleSelect = document.getElementById('role-select');
const simCurrentDateInput = document.getElementById('sim-current-date');
const tabContainer = document.getElementById('tab-container');
const slotsCount = document.getElementById('slots-count');
const slotsGrid = document.getElementById('slots-grid');
const slotsTitle = document.getElementById('slots-title');
const btnDateFuture = document.getElementById('btn-date-future');
const btnDatePast = document.getElementById('btn-date-past');
const myPanelWidget = document.getElementById('my-panel-widget');
const rankingTableBody = document.getElementById('ranking-table-body');
const notificationContainer = document.getElementById('notification-container');
const adminActionsBar = document.getElementById('admin-actions-bar');

// Abas da Visualização Principal
const tabBtnEscalas = document.getElementById('tab-btn-escalas');
const tabBtnCalendario = document.getElementById('tab-btn-calendario');
const tabBtnRegistro = document.getElementById('tab-btn-registro');
const tabBtnHistorico = document.getElementById('tab-btn-historico');
const tabBtnMinhasAutotrocas = document.getElementById('tab-btn-minhas-autotrocas');
const tabBtnAutotrocas = document.getElementById('tab-btn-autotrocas');
const tabBtnUsuarios = document.getElementById('tab-btn-usuarios');
const tabBtnAuditoria = document.getElementById('tab-btn-auditoria');
const tabBtnRelatorios = document.getElementById('tab-btn-relatorios');
const tabBtnConfiguracoes = document.getElementById('tab-btn-configuracoes');
const viewEscalas = document.getElementById('view-escalas');
const viewConfiguracoes = document.getElementById('view-configuracoes');
const viewCalendario = document.getElementById('view-calendario');
const viewRegistro = document.getElementById('view-registro');
const viewHistorico = document.getElementById('view-historico');
const viewMinhasAutotrocas = document.getElementById('view-minhas-autotrocas');
const viewAutotrocas = document.getElementById('view-autotrocas');
const viewUsuarios = document.getElementById('view-usuarios');
const viewAuditoria = document.getElementById('view-auditoria');
const viewRelatorios = document.getElementById('view-relatorios');
const viewMeuPainel = document.getElementById('view-meu-painel');

const calendarMonthsContainer = document.getElementById('calendar-months-container');
const calendarGroupSelector = document.getElementById('calendar-group-selector');
const btnCalendarPrev = document.getElementById('btn-calendar-prev');
const btnCalendarToday = document.getElementById('btn-calendar-today');
const btnCalendarNext = document.getElementById('btn-calendar-next');
let calendarSelectedGroupId = '';
let calendarStartMonthOffset = 0;

// Elementos de Detalhes do Calendário
const calendarDetailsModal = document.getElementById('calendar-details-modal');
const btnCloseCalendarDetails = document.getElementById('btn-close-calendar-details');
const btnCloseCalendarDetailsFooter = document.getElementById('btn-close-calendar-details-footer');
const calendarDetailsTitle = document.getElementById('calendar-details-title');
const calendarDetailsBody = document.getElementById('calendar-details-body');
let calendarSelectedDateDetails = '';

// Elementos de Autotroca
const confirmAssumeModal = document.getElementById('confirm-assume-modal');
const confirmNormalBtnContainer = document.getElementById('confirm-normal-btn-container');
const btnConfirmNormal = document.getElementById('btn-confirm-normal');
const btnConfirmAutotroca = document.getElementById('btn-confirm-autotroca');
const confirmDataFolga = document.getElementById('confirm-data-folga');
const confirmPaybackBtnContainer = document.getElementById('confirm-payback-btn-container');
const btnConfirmPayback = document.getElementById('btn-confirm-payback');
const btnCancelConfirmModal = document.getElementById('btn-cancel-confirm-modal');
const btnCloseConfirmModal = document.getElementById('btn-close-confirm-modal');

const autotrocaContrariaModal = document.getElementById('autotroca-contraria-modal');
const atUsuarioSelect = document.getElementById('at-usuario');
const atDataFolgaInput = document.getElementById('at-data-folga');
const autotrocaContrariaForm = document.getElementById('autotroca-contraria-form');
const btnOpenAutotrocaContrariaModal = document.getElementById('btn-open-autotroca-contraria-modal');
const btnCancelAutotrocaModal = document.getElementById('btn-cancel-autotroca-modal');
const btnCloseAutotrocaModal = document.getElementById('btn-close-autotroca-modal');

const agendarPagamentoModal = document.getElementById('agendar-pagamento-modal');
const agendarAtIdInput = document.getElementById('agendar-at-id');
const agendarDataInput = document.getElementById('agendar-data');
const agendarPagamentoForm = document.getElementById('agendar-pagamento-form');
const btnCancelAgendarModal = document.getElementById('btn-cancel-agendar-modal');
const btnCloseAgendarModal = document.getElementById('btn-close-agendar-modal');

// Elementos de Minhas Autotrocas
const minhasFolgasSaldoVal = document.getElementById('minhas-folgas-saldo-val');
const minhasFolgasPendentesVal = document.getElementById('minhas-folgas-pendentes-val');
const meusApoiosDebitosVal = document.getElementById('meus-apoios-debitos-val');
const minhasAutotrocasTableBody = document.getElementById('minhas-autotrocas-table-body');
const minhasAutotrocasMobileCards = document.getElementById('minhas-autotrocas-mobile-cards');

const regIsAutotrocaCheckbox = document.getElementById('reg-is-autotroca');
const containerRegDataFolga = document.getElementById('container-reg-data-folga');
const regDataFolgaInput = document.getElementById('reg-data-folga');

// Modais - Escalas
const addModal = document.getElementById('add-modal');
const btnOpenAddModal = document.getElementById('btn-open-add-modal');
const btnCloseAddModal = document.getElementById('btn-close-add-modal');
const btnCancelAddModal = document.getElementById('btn-cancel-add-modal');
const addSlotForm = document.getElementById('add-slot-form');
const modalRulesCheckboxes = document.getElementById('modal-rules-checkboxes');
const btnDeleteSlot = document.getElementById('btn-delete-slot');

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
const userFormApelido = document.getElementById('user-form-apelido');
const userFormEmail = document.getElementById('user-form-email');
const userFormCargo = document.getElementById('user-form-cargo');
const userFormNivel = document.getElementById('user-form-nivel');
const userFormGrupoTrabalho = document.getElementById('user-form-grupo-trabalho');
const userSearchInput = document.getElementById('user-search-input');
const usersTableBody = document.getElementById('users-table-body');

// Modal - Autogerenciamento de Áreas
const operatorAreasModal = document.getElementById('operator-areas-modal');
const btnCloseOperatorAreasModal = document.getElementById('btn-close-operator-areas-modal');
const btnCancelOperatorAreasModal = document.getElementById('btn-cancel-operator-areas-modal');
const operatorAreasForm = document.getElementById('operator-areas-form');
const operatorFormApelido = document.getElementById('operator-form-apelido');

// Modais - CSV
const csvModal = document.getElementById('csv-modal');
const btnOpenCsvModal = document.getElementById('btn-open-csv-modal');
const btnCloseCsvModalX = document.getElementById('btn-close-csv-modal-x');
const btnCancelCsvModal = document.getElementById('btn-cancel-csv-modal');
const btnExportUsers = document.getElementById('btn-export-users');
const fileImportUsers = document.getElementById('file-import-users');
const modeImportUsers = document.getElementById('mode-import-users');
const btnExportSlots = document.getElementById('btn-export-slots');
const fileImportSlots = document.getElementById('file-import-slots');
const modeImportSlots = document.getElementById('mode-import-slots');
const btnExportHistory = document.getElementById('btn-export-history');
const fileImportHistory = document.getElementById('file-import-history');
const modeImportHistory = document.getElementById('mode-import-history');

// Modal - Lei de Apoio
const leiModal = document.getElementById('lei-modal');
const btnOpenLeiModal = document.getElementById('btn-open-lei-modal');
const btnCloseLeiModal = document.getElementById('btn-close-lei-modal');
const btnCloseLeiModalOk = document.getElementById('btn-close-lei-modal-ok');
const leiModalBody = document.getElementById('lei-modal-body');

// Formulário de Auto-Registro
const regUsuarioSelect = document.getElementById('reg-usuario');
const regGrupoSelect = document.getElementById('reg-grupo');
const regCausaRaizSelect = document.getElementById('reg-causa-raiz');
const regSubgrupoInput = document.getElementById('reg-subgrupo');
const regDataInput = document.getElementById('reg-data');
const regHoraInicioInput = document.getElementById('reg-hora-inicio');
const regHoraTerminoInput = document.getElementById('reg-hora-termino');
const regDataLancamentoInput = document.getElementById('reg-data-lancamento');
const regDateWarning = document.getElementById('reg-date-warning');
const regBypassContainer = document.getElementById('reg-bypass-container');
const regBypassLimit = document.getElementById('reg-bypass-limit');
const rulesCheckboxContainer = document.getElementById('rules-checkbox-container');
const regPointsPreview = document.getElementById('reg-points-preview');
const regHorasPreview = document.getElementById('reg-horas-preview');
const regFormulaPreview = document.getElementById('reg-formula-preview');
const registerCompletedSupportForm = document.getElementById('register-completed-support-form');
const regFormTitle = document.getElementById('reg-form-title');
const btnCancelEditReg = document.getElementById('btn-cancel-edit-reg');
const btnSubmitReg = document.getElementById('btn-submit-reg');

// --- INICIALIZAÇÃO ---
function init() {
  // Configurar títulos dinâmicos da aplicação (Kikai - ID da Organização Ativa)
  document.title = `Kikai - ${orgId}`;
  const appTitleHeader = document.getElementById('app-title-header');
  if (appTitleHeader) {
    appTitleHeader.textContent = `Kikai - ${orgId}`;
  }
  const loginAppTitle = document.getElementById('login-app-title');
  if (loginAppTitle) {
    loginAppTitle.textContent = `Kikai - ${orgId}`;
  }

  loadData();
  initConfiguracoesWiring();

  // Configurar data de hoje
  if (simCurrentDateInput) {
    simCurrentDateInput.value = simulatedCurrentDate;
  }
  regDataLancamentoInput.value = formatDatePt(simulatedCurrentDate);

  // Listeners para a barra de navegação inferior mobile (PWA)
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) {
        switchView(view);
      }
    });
  });

  // Listeners do menu gaveta (Bottom Sheet Drawer)
  const btnMobileDrawerToggle = document.getElementById('btn-mobile-drawer-toggle');
  const mobileMenuDrawer = document.getElementById('mobile-menu-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerItemBtns = document.querySelectorAll('.drawer-item-btn');

  if (btnMobileDrawerToggle && mobileMenuDrawer) {
    btnMobileDrawerToggle.addEventListener('click', () => {
      mobileMenuDrawer.classList.add('active');
      mobileMenuDrawer.style.display = 'flex';
    });
  }

  function closeMobileDrawer() {
    if (mobileMenuDrawer) {
      mobileMenuDrawer.classList.remove('active');
      setTimeout(() => {
        if (!mobileMenuDrawer.classList.contains('active')) {
          mobileMenuDrawer.style.display = 'none';
        }
      }, 350);
    }
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', closeMobileDrawer);
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', closeMobileDrawer);
  }

  drawerItemBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) {
        switchView(view);
      }
      closeMobileDrawer();
    });
  });

  // Listeners de navegação principal
  tabBtnEscalas.addEventListener('click', () => switchView('escalas'));
  if (tabBtnCalendario) {
    tabBtnCalendario.addEventListener('click', () => switchView('calendario'));
  }
  if (btnCalendarPrev) {
    btnCalendarPrev.addEventListener('click', () => {
      calendarStartMonthOffset--;
      renderCalendarView();
    });
  }
  if (btnCalendarToday) {
    btnCalendarToday.addEventListener('click', () => {
      calendarStartMonthOffset = 0;
      renderCalendarView();
    });
  }
  if (btnCalendarNext) {
    btnCalendarNext.addEventListener('click', () => {
      calendarStartMonthOffset++;
      renderCalendarView();
    });
  }
  tabBtnRegistro.addEventListener('click', () => switchView('registro'));
  tabBtnHistorico.addEventListener('click', () => switchView('historico'));
  tabBtnUsuarios.addEventListener('click', () => switchView('usuarios'));
  if (tabBtnAuditoria) {
    tabBtnAuditoria.addEventListener('click', () => switchView('auditoria'));
  }
  if (tabBtnRelatorios) {
    tabBtnRelatorios.addEventListener('click', () => switchView('relatorios'));
  }
  if (tabBtnConfiguracoes) {
    tabBtnConfiguracoes.addEventListener('click', () => switchView('configuracoes'));
  }

  // Listeners de filtros de data para escalas
  if (btnDateFuture && btnDatePast) {
    btnDateFuture.addEventListener('click', () => {
      escalaDateFilter = 'future';
      btnDateFuture.classList.add('active');
      btnDatePast.classList.remove('active');
      if (slotsTitle) slotsTitle.textContent = 'Apoios Solicitados';
      renderSlots();
    });
    btnDatePast.addEventListener('click', () => {
      escalaDateFilter = 'past';
      btnDatePast.classList.add('active');
      btnDateFuture.classList.remove('active');
      if (slotsTitle) slotsTitle.textContent = 'Apoios Anteriores (Histórico)';
      renderSlots();
    });
  }

  // Listeners de filtros da Auditoria
  const audFilterUser = document.getElementById('auditoria-filter-user');
  const audFilterStatus = document.getElementById('auditoria-filter-status');
  const audFilterDateStart = document.getElementById('auditoria-filter-date-start');
  const audFilterDateEnd = document.getElementById('auditoria-filter-date-end');
  if (audFilterUser) audFilterUser.addEventListener('change', renderAuditoriaTable);
  if (audFilterStatus) audFilterStatus.addEventListener('change', renderAuditoriaTable);
  if (audFilterDateStart) audFilterDateStart.addEventListener('change', renderAuditoriaTable);
  if (audFilterDateEnd) audFilterDateEnd.addEventListener('change', renderAuditoriaTable);

  // Listeners de simulação com salvaguardas (elementos removidos em produção)
  if (roleSelect) {
    roleSelect.addEventListener('change', handleRoleChange);
  }
  if (simCurrentDateInput) {
    simCurrentDateInput.addEventListener('change', handleSimDateChange);
  }

  // Listener do Modo de Vista Admin (Adailton)
  const adminViewModeSelect = document.getElementById('admin-view-mode-select');
  if (adminViewModeSelect) {
    adminViewModeSelect.addEventListener('change', (e) => {
      adminViewMode = e.target.value;
      renderAll();
    });
  }

  // Modais - Adicionar Escala
  const formTipoData = document.getElementById('form-tipo-data');
  const containerDataUnica = document.getElementById('container-data-unica');
  const containerDataIntervalo = document.getElementById('container-data-intervalo');
  const formDataInput = document.getElementById('form-data');
  const formDataInicioInput = document.getElementById('form-data-inicio');
  const formDataFimInput = document.getElementById('form-data-fim');

  if (formTipoData) {
    formTipoData.addEventListener('change', () => {
      const tipo = formTipoData.value;
      if (tipo === 'unica') {
        containerDataUnica.style.display = 'block';
        containerDataIntervalo.style.display = 'none';
        formDataInput.required = true;
        formDataInicioInput.required = false;
        formDataFimInput.required = false;
      } else {
        containerDataUnica.style.display = 'none';
        containerDataIntervalo.style.display = 'grid';
        formDataInput.required = false;
        formDataInicioInput.required = true;
        formDataFimInput.required = true;
      }
    });
  }

  btnOpenAddModal.addEventListener('click', () => {
    addModal.style.display = 'flex';
    const elMotivo = document.getElementById('form-motivo');
    if (elMotivo) {
      elMotivo.disabled = !isCurrentUserAdminOrSupervisor();
    }
  });
  btnCloseAddModal.addEventListener('click', handleCancelarSlotModal);
  btnCancelAddModal.addEventListener('click', handleCancelarSlotModal);
  addSlotForm.addEventListener('submit', handleCriarSolicitacaoSlot);
  if (btnDeleteSlot) {
    btnDeleteSlot.addEventListener('click', handleExcluirSlotAdmin);
  }

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

  // Modais - CSV
  if (btnOpenCsvModal) {
    btnOpenCsvModal.addEventListener('click', () => { csvModal.style.display = 'flex'; });
  }
  if (btnCloseCsvModalX) {
    btnCloseCsvModalX.addEventListener('click', () => { csvModal.style.display = 'none'; });
  }
  if (btnCancelCsvModal) {
    btnCancelCsvModal.addEventListener('click', () => { csvModal.style.display = 'none'; });
  }
  if (btnExportUsers) {
    btnExportUsers.addEventListener('click', exportUsersToCSV);
  }
  if (btnExportSlots) {
    btnExportSlots.addEventListener('click', exportSlotsToCSV);
  }
  if (btnExportHistory) {
    btnExportHistory.addEventListener('click', exportHistoryToCSV);
  }
  if (fileImportUsers) {
    fileImportUsers.addEventListener('change', handleImportUsersCSV);
  }
  if (fileImportSlots) {
    fileImportSlots.addEventListener('change', handleImportSlotsCSV);
  }
  if (fileImportHistory) {
    fileImportHistory.addEventListener('change', handleImportHistoryCSV);
  }

  // Modal - Lei de Apoio
  if (btnOpenLeiModal) {
    btnOpenLeiModal.addEventListener('click', (e) => {
      e.preventDefault();
      openLeiModal();
    });
  }
  if (btnCloseLeiModal) {
    btnCloseLeiModal.addEventListener('click', () => leiModal.style.display = 'none');
  }
  if (btnCloseLeiModalOk) {
    btnCloseLeiModalOk.addEventListener('click', () => leiModal.style.display = 'none');
  }

  // Formulário de Auto-Registro - Eventos
  regDataInput.addEventListener('change', checkLateSubmission);
  regHoraInicioInput.addEventListener('change', updatePointsPreview);
  regHoraTerminoInput.addEventListener('change', updatePointsPreview);
  regBypassLimit.addEventListener('change', updatePointsPreview);
  btnCancelEditReg.addEventListener('click', handleCancelarEdicaoApoio);
  registerCompletedSupportForm.addEventListener('submit', handleAutoRegistroApoio);
  document.getElementById('history-filter-user').addEventListener('change', renderHistoryTable);

  // Botão de recarregar no erro de conexão
  const btnReloadConnection = document.getElementById('btn-reload-connection-error');
  if (btnReloadConnection) {
    btnReloadConnection.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Ouvinte de status de rede offline
  window.addEventListener('offline', () => {
    if (isFirebaseEnabled) {
      showConnectionError();
    }
  });

  // Preencher elementos de formulário
  renderFormGroupsOptions();
  renderRulesCheckboxes();

  // Inicializar checkboxes de áreas e funções
  renderAreasCheckboxList('user-areas-checkboxes-container', 'user-areas-funcoes');
  renderAreasCheckboxList('slot-areas-checkboxes-container', 'slot-areas-funcoes');
  renderAreasCheckboxList('reg-areas-checkboxes-container', 'reg-areas-funcoes');
  renderAreasCheckboxList('operator-areas-checkboxes-container', 'operator-areas-funcoes');

  // Adicionar listeners para botões do modal de autogerenciamento
  if (btnCloseOperatorAreasModal) {
    btnCloseOperatorAreasModal.addEventListener('click', () => { operatorAreasModal.style.display = 'none'; });
  }
  if (btnCancelOperatorAreasModal) {
    btnCancelOperatorAreasModal.addEventListener('click', () => { operatorAreasModal.style.display = 'none'; });
  }
  if (operatorAreasForm) {
    operatorAreasForm.addEventListener('submit', handleSaveOperatorAreas);
  }

  // Monitorar alterações nos checkboxes do slot para atualizar a compatibilidade dos usuários e o subgrupo (usando delegação de eventos)
  const slotAreasContainer = document.getElementById('slot-areas-checkboxes-container');
  if (slotAreasContainer) {
    slotAreasContainer.addEventListener('change', (e) => {
      if (e.target && e.target.name === 'slot-areas-funcoes') {
        updateFormSubgrupoFromAreas();
        updateFormUsuarioSelectCompatibility();
      }
    });
  }

  const elFormData = document.getElementById('form-data');
  if (elFormData) {
    elFormData.addEventListener('change', updateFormUsuarioSelectCompatibility);
  }
  const elFormHoraInicio = document.getElementById('form-hora-inicio');
  if (elFormHoraInicio) {
    elFormHoraInicio.addEventListener('change', updateFormUsuarioSelectCompatibility);
  }
  const elFormHoraTermino = document.getElementById('form-hora-termino');
  if (elFormHoraTermino) {
    elFormHoraTermino.addEventListener('change', updateFormUsuarioSelectCompatibility);
  }

  // Evento do filtro de compatibilidade do operador
  const filterMyAreasCheck = document.getElementById('filter-my-areas');
  if (filterMyAreasCheck) {
    filterMyAreasCheck.addEventListener('change', renderSlots);
  }

  // Ouvintes de Eventos da Autotroca
  if (tabBtnAutotrocas) {
    tabBtnAutotrocas.addEventListener('click', () => switchView('autotrocas'));
  }
  if (tabBtnMinhasAutotrocas) {
    tabBtnMinhasAutotrocas.addEventListener('click', () => switchView('minhas-autotrocas'));
  }

  const atFilterUser = document.getElementById('autotroca-filter-user');
  const atFilterStatus = document.getElementById('autotroca-filter-status');
  if (atFilterUser) atFilterUser.addEventListener('change', renderAutotrocasTable);
  if (atFilterStatus) atFilterStatus.addEventListener('change', renderAutotrocasTable);

  if (btnConfirmNormal) btnConfirmNormal.addEventListener('click', () => handleConfirmAssumeSelection(false));
  if (btnConfirmAutotroca) btnConfirmAutotroca.addEventListener('click', () => handleConfirmAssumeSelection(true));
  if (btnConfirmPayback) btnConfirmPayback.addEventListener('click', () => handleConfirmAssumeSelection(false, true));
  if (btnCancelConfirmModal) btnCancelConfirmModal.addEventListener('click', () => { confirmAssumeModal.style.display = 'none'; });
  if (btnCloseConfirmModal) btnCloseConfirmModal.addEventListener('click', () => { confirmAssumeModal.style.display = 'none'; });

  // Ouvintes de Eventos dos Detalhes do Calendário
  if (btnCloseCalendarDetails) {
    btnCloseCalendarDetails.addEventListener('click', () => {
      calendarDetailsModal.style.display = 'none';
      calendarSelectedDateDetails = '';
    });
  }
  if (btnCloseCalendarDetailsFooter) {
    btnCloseCalendarDetailsFooter.addEventListener('click', () => {
      calendarDetailsModal.style.display = 'none';
      calendarSelectedDateDetails = '';
    });
  }

  if (btnOpenAutotrocaContrariaModal) {
    btnOpenAutotrocaContrariaModal.addEventListener('click', () => {
      populateAutotrocaContrariaUsers();
      autotrocaContrariaModal.style.display = 'flex';
    });
  }
  if (btnCloseAutotrocaModal) btnCloseAutotrocaModal.addEventListener('click', () => { autotrocaContrariaModal.style.display = 'none'; });
  if (btnCancelAutotrocaModal) btnCancelAutotrocaModal.addEventListener('click', () => { autotrocaContrariaModal.style.display = 'none'; });
  if (autotrocaContrariaForm) autotrocaContrariaForm.addEventListener('submit', handleSaveAutotrocaContraria);

  if (regIsAutotrocaCheckbox) {
    regIsAutotrocaCheckbox.addEventListener('change', () => {
      if (containerRegDataFolga) {
        containerRegDataFolga.style.display = regIsAutotrocaCheckbox.checked ? 'block' : 'none';
        regDataFolgaInput.required = regIsAutotrocaCheckbox.checked;
      }
    });
  }

  // Fechar modais ao clicar fora
  window.addEventListener('click', (e) => {
    if (e.target === addModal) handleCancelarSlotModal();
    if (e.target === whatsappModal) whatsappModal.style.display = 'none';
    if (e.target === infracaoModal) infracaoModal.style.display = 'none';
    if (e.target === userModal) userModal.style.display = 'none';
    if (e.target === operatorAreasModal) operatorAreasModal.style.display = 'none';
    if (e.target === leiModal) leiModal.style.display = 'none';
    if (e.target === csvModal) csvModal.style.display = 'none';
    if (e.target === confirmAssumeModal) confirmAssumeModal.style.display = 'none';
    if (e.target === autotrocaContrariaModal) autotrocaContrariaModal.style.display = 'none';
    if (e.target === agendarPagamentoModal) agendarPagamentoModal.style.display = 'none';
    if (e.target === calendarDetailsModal) {
      calendarDetailsModal.style.display = 'none';
      calendarSelectedDateDetails = '';
    }
  });

  // Inicialização obrigatória do Firebase
  if (isFirebaseEnabled) {
    // 1. Mostrar overlay de login
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';

    // 2. Ouvir mudanças de autenticação
    onAuthChange((googleUser) => {
      if (googleUser) {
        authenticatedGoogleUser = googleUser;
        // Iniciar sincro em tempo real
        setupRealtimeSync();
      } else {
        authenticatedGoogleUser = null;
        stopRealtimeSync();

        if (loginOverlay) loginOverlay.style.display = 'flex';
        document.getElementById('auth-header-panel').style.display = 'none';
        
        const switcher = document.getElementById('sim-role-switcher');
        if (switcher) switcher.style.display = 'none';

        const adminModeToggle = document.getElementById('admin-mode-toggle');
        if (adminModeToggle) adminModeToggle.style.display = 'none';
      }
    });

    // 3. Vincular cliques de Login e Logout
    const btnLogin = document.getElementById('btn-google-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', async () => {
        try {
          document.getElementById('login-error-message').style.display = 'none';
          await loginWithGoogle();
        } catch (err) {
          showBanner("Erro na autenticação com o Google.", "danger");
        }
      });
    }

    const btnLogout = document.getElementById('btn-google-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        logout();
      });
    }
  } else {
    // Sem Firebase: Exibir overlay de erro de configuração e travar a UI
    showConnectionError(
      "Erro de Configuração",
      "O Firebase é obrigatório para o funcionamento deste sistema. A operação em modo local (offline) está desativada.",
      false
    );
  }
}

// --- TEMA DE CORES ---

const THEME_KEY = 'apoio-rnest-theme';
const THEMES = {
  escuro: { label: '🌙 Modo Escuro', attr: null },
  claro:  { label: '☀️ Modo Claro',  attr: 'claro' }
};

function applyTheme(themeKey) {
  const html = document.documentElement;
  const theme = THEMES[themeKey] || THEMES.escuro;
  if (theme.attr) {
    html.setAttribute('data-theme', theme.attr);
  } else {
    html.removeAttribute('data-theme');
  }
  // Atualiza o label do botão
  const label = document.getElementById('theme-toggle-label');
  if (label) label.textContent = theme.label;
  // Salva preferência
  localStorage.setItem(THEME_KEY, themeKey);
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'escuro';
  const next = current === 'escuro' ? 'claro' : 'escuro';
  applyTheme(next);
}

// Aplica o tema salvo imediatamente ao carregar
(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'escuro';
  // Lida com chaves antigas salvas em cache local
  if (saved === 'padrao') {
    applyTheme('escuro');
  } else if (saved === 'empresa') {
    applyTheme('claro');
  } else {
    applyTheme(saved);
  }
})();

// Wiring do botão de tema
const btnThemeToggle = document.getElementById('btn-theme-toggle');
if (btnThemeToggle) {
  btnThemeToggle.addEventListener('click', toggleTheme);
}

let unsubscribers = [];

function showConnectionError(title = null, text = null, showReload = true) {
  const overlay = document.getElementById('connection-error-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    const errorTitle = overlay.querySelector('.modal-title');
    const errorText = overlay.querySelector('p');
    const errorBtn = document.getElementById('btn-reload-connection-error');
    if (errorTitle && title) errorTitle.textContent = title;
    if (errorText && text) errorText.textContent = text;
    if (errorBtn) {
      errorBtn.style.display = showReload ? 'block' : 'none';
    }
  }
}

function hideConnectionError() {
  const overlay = document.getElementById('connection-error-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Expor função global de erro fatal para ser usada pelo firebase-db.js
window.showFatalError = function(title, text) {
  showConnectionError(title, text, false);
};

let tokenRegistered = false;

async function registerFCMTokenForUser(userId) {
  if (tokenRegistered) return;
  
  // Salvaguarda: impede registro se a lista de usuários não estiver devidamente sincronizada do Firebase
  if (!syncedDocs.users) {
    console.warn("⚠️ Registro de token FCM adiado pois a lista de usuários ainda não foi sincronizada do Firebase.");
    return;
  }

  try {
    const token = await getNotificationToken();
    if (!token) return;

    const userIdx = users.findIndex(u => u.id === userId);
    if (userIdx !== -1) {
      const userObj = { ...users[userIdx] };
      if (!userObj.pushTokens) {
        userObj.pushTokens = [];
      }

      if (!userObj.pushTokens.includes(token)) {
        userObj.pushTokens.push(token);
        const updatedUsers = [...users];
        updatedUsers[userIdx] = userObj;
        tokenRegistered = true;
        await updateDocument('users', updatedUsers);
        console.log("🔔 Token FCM registrado com sucesso para o usuário:", userId);
      } else {
        tokenRegistered = true;
      }
    }
  } catch (err) {
    console.error("Erro ao registrar token FCM no Firestore:", err);
  }
}

function stopRealtimeSync() {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  }
  dbConnected = false;
  syncedDocs = {
    users: false,
    groups: false,
    slots: false,
    history: false,
    candidatos: false,
    autotrocas: false
  };
  hideConnectionError();
}

function setupRealtimeSync() {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];

  dbConnected = false;
  if (connectionTimeout) clearTimeout(connectionTimeout);
  connectionTimeout = setTimeout(() => {
    if (isFirebaseEnabled && !dbConnected) {
      showConnectionError();
    }
  }, 6000); // 6 segundos de tolerância de conexão no carregamento inicial

  const defaultCandidatos = {};

  // Sync users
  unsubscribers.push(syncDocument('users', [], (data) => {
    syncedDocs.users = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    users = data.map(u => {
      let updatedUser = { ...u };
      if (!updatedUser.areasFuncoes) {
        updatedUser.areasFuncoes = getDefaultAreasForUser(updatedUser);
      }
      if (!updatedUser.grupoTrabalho) {
        updatedUser.grupoTrabalho = getDefaultGrupoTrabalho(updatedUser);
      }
      if (!updatedUser.apelido) {
        updatedUser.apelido = updatedUser.nome ? updatedUser.nome.trim().split(' ')[0] : 'Desconhecido';
      }
      return updatedUser;
    });
    
    if (isFirebaseEnabled && authenticatedGoogleUser) {
      const wasEmpty = users.length === 0;
      ensureAdminPresence();
      if (wasEmpty && users.length > 0) {
        // Banco estava completamente vazio, inicializa com o administrador principal
        updateDocument('users', users, true);
      }

      // Encontrar usuário correspondente
      let matched = users.find(u => 
        u.email.toLowerCase() === authenticatedGoogleUser.email.toLowerCase() ||
        u.id.toLowerCase() === authenticatedGoogleUser.email.split('@')[0].toLowerCase()
      );

      // Se o banco de dados estiver completamente vazio e o usuário não for o administrador principal 
      // (que já teria sido adicionado pela ensureAdminPresence), bloqueia o acesso por segurança
      if (!matched && users.length === 0) {
        console.error("Tentativa de login bloqueada: Banco de dados de usuários vazio ou indisponível.");
        showBanner("O banco de dados está temporariamente indisponível. Por favor, contate o administrador.", "danger");
        logout();
        return;
      }

      if (matched) {
        currentUser = matched;
        currentUserId = matched.id;

        // Registrar token FCM para notificações push
        registerFCMTokenForUser(matched.id);

        // Esconder tela de login
        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) loginOverlay.style.display = 'none';
        document.getElementById('login-error-message').style.display = 'none';

        // Atualizar cabeçalho de autenticação
        document.getElementById('auth-header-panel').style.display = 'flex';
        document.getElementById('auth-user-name').textContent = authenticatedGoogleUser.displayName || matched.nome;
        document.getElementById('auth-user-role').textContent = `${matched.cargo} (${matched.tipo})`;

        // Controle do switcher de simulação para segurança
        const isRealAdmin = authenticatedGoogleUser.email.toLowerCase() === 'adailton.medeiros@gmail.com' || matched.id === 'AB3R';
        const isGestor = matched.tipo === 'ADMINISTRADOR' || matched.tipo === 'GERENTE' || matched.tipo === 'SUPERVISOR' || isRealAdmin;
        const switcher = document.getElementById('sim-role-switcher');
        if (switcher) {
          switcher.style.display = isGestor ? 'flex' : 'none';
        }

        // Alternador de modo de vista para gestores
        const adminModeToggle = document.getElementById('admin-mode-toggle');
        if (adminModeToggle) {
          adminModeToggle.style.display = isGestor ? 'flex' : 'none';
        }
      } else {
        // Usuário logado mas não cadastrado
        document.getElementById('login-error-message').style.display = 'block';
        logout();
        return; // não renderiza nada ainda
      }
    } else if (currentUser) {
      const updatedUser = users.find(u => u.id === currentUser.id);
      if (updatedUser) {
        currentUser = updatedUser;
        currentUserId = updatedUser.id;
      }
    } else {
      currentUser = users.find(u => u.id === currentUserId) || users[0];
      currentUserId = currentUser.id;
    }
    renderAll();
  }));

  // Sync groups
  unsubscribers.push(syncDocument('groups', INITIAL_GROUPS, (data) => {
    syncedDocs.groups = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    groups = data;
    renderAll();
  }));

  // Sync slots
  unsubscribers.push(syncDocument('slots', [], (data) => {
    syncedDocs.slots = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    slots = data;
    renderAll();
  }));

  // Sync history
  unsubscribers.push(syncDocument('history', [], (data) => {
    syncedDocs.history = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    history = data;
    renderAll();
  }));

  // Sync candidatos
  unsubscribers.push(syncDocument('candidatos', defaultCandidatos, (data) => {
    syncedDocs.candidatos = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    candidatos = data;
    renderAll();
  }));

  // Sync autotrocas
  unsubscribers.push(syncDocument('autotrocas', [], (data) => {
    syncedDocs.autotrocas = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    autotrocas = data;
    renderAll();
  }));

  // Sync config
  unsubscribers.push(syncDocument('config', DEFAULT_CONFIG, (data) => {
    syncedDocs.config = true;
    if (areAllDocsSynced()) {
      dbConnected = true;
      hideConnectionError();
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }

    currentConfig = {
      ...DEFAULT_CONFIG,
      ...data
    };
    if (currentConfig.areasFuncoes) {
      currentConfig.areasFuncoes = JSON.parse(JSON.stringify(currentConfig.areasFuncoes));
    } else {
      currentConfig.areasFuncoes = JSON.parse(JSON.stringify(AREAS_FUNCOES));
    }
    supportRules = currentConfig.supportRules || [ ...SUPPORT_RULES ];
    renderAll();
  }));
}

function loadData() {
  const data = getStoredData();
  users = data.users;
  groups = data.groups;
  slots = data.slots;
  history = data.history;
  candidatos = {};
  autotrocas = [];
  currentConfig = { ...DEFAULT_CONFIG };
  currentConfig.areasFuncoes = JSON.parse(JSON.stringify(DEFAULT_CONFIG.areasFuncoes || AREAS_FUNCOES));
  supportRules = [ ...SUPPORT_RULES ];
  currentUser = users.find(u => u.id === currentUserId) || users[0];
  currentUserId = currentUser.id;
}

function ensureAdminPresence() {
  const adminEmail = 'adailton.medeiros@gmail.com';
  const adminId = 'AB3R';
  
  if (!users) users = [];
  let adminIndex = users.findIndex(u => u.id === adminId || u.email.toLowerCase() === adminEmail);
  
  if (adminIndex === -1) {
    console.warn("⚠️ ALERTA: Administrador principal AB3R ausente na lista de usuários. Reinserindo automaticamente.");
    users.push({
      id: adminId,
      nome: 'Adailton Medeiros Rodrigues de Oliveira',
      apelido: 'Adailton',
      email: adminEmail,
      tipo: 'ADMINISTRADOR',
      cargo: 'Administrador',
      infracoesWA: 0,
      areasFuncoes: ['SUPERVISORES'],
      grupoTrabalho: 'grupo_a'
    });
  } else {
    // Garante que o tipo é ADMINISTRADOR e o email está correto
    const currentAdmin = users[adminIndex];
    if (currentAdmin.tipo !== 'ADMINISTRADOR' || currentAdmin.email.toLowerCase() !== adminEmail) {
      console.warn("⚠️ ALERTA: Dados do administrador principal violados. Corrigindo automaticamente.");
      users[adminIndex] = {
        ...currentAdmin,
        id: adminId, // Força o ID correto
        email: adminEmail, // Força o email correto
        tipo: 'ADMINISTRADOR' // Força o tipo correto
      };
    }
  }
}

function persistChanges(onlyDocName = null, force = false) {
  if (isFirebaseEnabled) {
    const docsToUpdate = onlyDocName 
      ? (Array.isArray(onlyDocName) ? onlyDocName : [onlyDocName])
      : ['users', 'groups', 'slots', 'history', 'candidatos', 'autotrocas', 'config'];

    docsToUpdate.forEach(docName => {
      // Salvaguarda crítica: nunca sobrescrever o Firebase se o documento ainda não foi sincronizado localmente.
      if (!syncedDocs[docName]) {
        console.warn(`⚠️ Persistência de '${docName}' ignorada porque os dados ainda não foram completamente sincronizados do Firebase.`);
        return;
      }

      if (docName === 'users') {
        ensureAdminPresence();
        updateDocument('users', users, force);
      }
      else if (docName === 'groups') updateDocument('groups', groups, force);
      else if (docName === 'slots') updateDocument('slots', slots, force);
      else if (docName === 'history') updateDocument('history', history, force);
      else if (docName === 'candidatos') updateDocument('candidatos', candidatos, force);
      else if (docName === 'autotrocas') updateDocument('autotrocas', autotrocas, force);
      else if (docName === 'config') updateDocument('config', currentConfig, force);
    });
  } else {
    showConnectionError();
  }
}

function switchView(view) {
  currentView = view;
  
  // Atualizar abas desktop
  tabBtnEscalas.classList.toggle('active', view === 'escalas');
  if (tabBtnCalendario) {
    tabBtnCalendario.classList.toggle('active', view === 'calendario');
  }
  tabBtnRegistro.classList.toggle('active', view === 'registro');
  tabBtnHistorico.classList.toggle('active', view === 'historico');
  tabBtnUsuarios.classList.toggle('active', view === 'usuarios');
  if (tabBtnMinhasAutotrocas) {
    tabBtnMinhasAutotrocas.classList.toggle('active', view === 'minhas-autotrocas');
  }
  if (tabBtnAuditoria) {
    tabBtnAuditoria.classList.toggle('active', view === 'auditoria');
  }
  if (tabBtnRelatorios) {
    tabBtnRelatorios.classList.toggle('active', view === 'relatorios');
  }
  if (tabBtnAutotrocas) {
    tabBtnAutotrocas.classList.toggle('active', view === 'autotrocas');
  }
  if (tabBtnConfiguracoes) {
    tabBtnConfiguracoes.classList.toggle('active', view === 'configuracoes');
  }

  // Sincronizar abas móveis (barra inferior)
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  mobileNavBtns.forEach(btn => {
    const btnView = btn.getAttribute('data-view');
    btn.classList.toggle('active', btnView === view);
  });

  // Tratar visualização de ranking em mobile
  const dashboardGrid = document.querySelector('.dashboard-grid');
  if (dashboardGrid) {
    dashboardGrid.classList.toggle('viewing-ranking', view === 'ranking');
  }

  // Atualizar contêineres
  viewEscalas.style.display = view === 'escalas' ? 'block' : 'none';
  if (viewCalendario) {
    viewCalendario.style.display = view === 'calendario' ? 'block' : 'none';
  }
  viewRegistro.style.display = view === 'registro' ? 'block' : 'none';
  viewHistorico.style.display = view === 'historico' ? 'block' : 'none';
  viewUsuarios.style.display = view === 'usuarios' ? 'block' : 'none';
  if (viewMinhasAutotrocas) {
    viewMinhasAutotrocas.style.display = view === 'minhas-autotrocas' ? 'block' : 'none';
  }
  if (viewAuditoria) {
    viewAuditoria.style.display = view === 'auditoria' ? 'block' : 'none';
  }
  if (viewRelatorios) {
    viewRelatorios.style.display = view === 'relatorios' ? 'block' : 'none';
  }
  if (viewAutotrocas) {
    viewAutotrocas.style.display = view === 'autotrocas' ? 'block' : 'none';
  }
  if (viewConfiguracoes) {
    viewConfiguracoes.style.display = view === 'configuracoes' ? 'block' : 'none';
  }
  if (viewMeuPainel) {
    viewMeuPainel.style.display = view === 'meu-painel' ? 'block' : 'none';
  }

  if (view === 'meu-painel') {
    renderMyPanel();
  }

  if (view === 'calendario') {
    renderCalendarView();
  }

  if (view === 'auditoria') {
    renderAuditoriaTable();
  }

  if (view === 'minhas-autotrocas') {
    renderMinhasAutotrocas();
  }

  if (view === 'relatorios') {
    renderRelatorios();
  }

  if (view === 'autotrocas') {
    renderAutotrocasTable();
  }

  if (view === 'configuracoes') {
    renderConfiguracoes();
  }

  if (view === 'registro') {
    const isGestor = isCurrentUserGestor();
    
    // Configurar o usuário atual selecionado no formulário se não estiver em edição
    if (!editingHistoryId) {
      const apoiadores = users.filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN');
      if (apoiadores.length > 0) {
        regUsuarioSelect.value = isCurrentUserOperador() ? currentUser.id : apoiadores[0].id;
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
    if (editingHistoryId) {
      regSubgrupoInput.value = '';
      regDataInput.value = '';
      if (regGrupoSelect) regGrupoSelect.selectedIndex = 0;
      rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('input[name="reg-areas-funcoes"]').forEach(cb => cb.checked = false);
      if (regBypassLimit) regBypassLimit.checked = false;
      if (regIsAutotrocaCheckbox) regIsAutotrocaCheckbox.checked = false;
      if (regDataFolgaInput) regDataFolgaInput.value = '';
      if (containerRegDataFolga) containerRegDataFolga.style.display = 'none';
    }
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

function parseDateRobust(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  
  const str = String(dateStr).trim();
  
  // Tratar formato DD/MM/YYYY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexado
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  
  // Tratar formato YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function getDebtExpirationDays(at, simDateStr) {
  if (!at || !at.dataFolga) return null;
  const folgaDate = parseDateRobust(at.dataFolga);
  const simDate = parseDateRobust(simDateStr);
  if (!folgaDate || !simDate) return null;
  
  // 180 dias a partir da data de folga
  const expirationDate = new Date(folgaDate.getTime() + 180 * 24 * 60 * 60 * 1000);
  const diffTime = expirationDate - simDate;
  const diffDays = Math.ceil(diffTime / (24 * 60 * 60 * 1000));
  return isNaN(diffDays) ? null : diffDays;
}

function getUserMinDebtExpirationDays(userId, simDateStr, includePaybackSlotId = null) {
  let debts = autotrocas.filter(at => at.usuarioId === userId && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE');
  
  // Se estamos avaliando substituição de um slot de payback, o débito que o ocupante
  // está quitando (CONCLUIDO) voltará para PENDENTE se for bumped — incluir na comparação
  if (includePaybackSlotId) {
    const paybackDebt = autotrocas.find(at =>
      at.usuarioId === userId &&
      at.tipo === 'CONTRARIA' &&
      at.status === 'CONCLUIDO' &&
      at.slotId === includePaybackSlotId
    );
    if (paybackDebt) {
      debts = [...debts, paybackDebt];
    }
  }
  
  if (debts.length === 0) return null;
  
  let minDays = Infinity;
  let hasValid = false;
  
  debts.forEach(at => {
    const days = getDebtExpirationDays(at, simDateStr);
    if (days !== null && !isNaN(days)) {
      hasValid = true;
      if (days < minDays) {
        minDays = days;
      }
    }
  });
  
  return hasValid ? minDays : null;
}

function hasHigherPriority(userAId, userBId, slotId = null) {
  // Para o ocupante (B), incluir o débito do slot de payback (se houver) pois ele voltará a PENDENTE se bumped
  const minDaysA = getUserMinDebtExpirationDays(userAId, simulatedCurrentDate);
  const minDaysB = getUserMinDebtExpirationDays(userBId, simulatedCurrentDate, slotId);
  
  const hasDebtA = minDaysA !== null && !isNaN(minDaysA) && minDaysA !== Infinity;
  const hasDebtB = minDaysB !== null && !isNaN(minDaysB) && minDaysB !== Infinity;
  
  if (hasDebtA && !hasDebtB) return true;
  if (!hasDebtA && hasDebtB) return false;
  
  if (hasDebtA && hasDebtB) {
    if (minDaysA !== minDaysB) {
      return minDaysA < minDaysB;
    }
  }

  // Fallback para pontuação geral
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
  
  const parsedA = parseDateRobust(dateA);
  const parsedB = parseDateRobust(dateB);
  if (parsedA === null && parsedB !== null) return true;
  if (parsedB === null && parsedA !== null) return false;
  if (parsedA === null && parsedB === null) return false;
  
  return parsedA < parsedB;
}

function handleSubstituirVaga(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const occupant = users.find(u => u.id === slot.usuarioId);
  const occupantIsExcluido = occupant && (occupant.cargo === 'GPI' || occupant.cargo === 'OPMAN');
  const hasPriority = occupantIsExcluido || hasHigherPriority(currentUser.id, slot.usuarioId, slot.id);
  
  if (!hasPriority) {
    showBanner('Você não possui prioridade suficiente para substituir este operador.', 'danger');
    return;
  }

  // Verificar compatibilidade de áreas/funções
  if (slot.areasFuncoes && slot.areasFuncoes.length > 0) {
    const userAreas = currentUser.areasFuncoes || [];
    const isCompatible = slot.areasFuncoes.some(area => userAreas.includes(area));
    if (!isCompatible) {
      showBanner('Você não possui as áreas/funções de atuação necessárias para substituir este apoio.', 'danger');
      return;
    }
  }

  if (slot.data < simulatedCurrentDate) {
    showBanner('Não é possível substituir vagas de apoio do histórico (datas passadas).', 'danger');
    return;
  }

  if (isLessThan24HoursBefore(slot)) {
    showBanner('Não é possível substituir vagas de apoio faltando menos de 24 horas para o início.', 'danger');
    return;
  }

  const alreadyHasSupport = slots.some(s => s.usuarioId === currentUser.id && s.data === slot.data && s.status === 'ATRIBUIDO' && s.id !== slotId);
  if (alreadyHasSupport) {
    showBanner('Você já possui um apoio atribuído para esta data.', 'danger');
    return;
  }

  openConfirmAssumeModal(slotId, true);
}

function executeSubstituirVaga(slotId, isAutotroca, folgaDate = '', isPayback = false, selectedRules = null, selectedArea = null) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  if (isLessThan24HoursBefore(slot)) {
    showBanner('Não é possível substituir vagas de apoio faltando menos de 24 horas para o início.', 'danger');
    return;
  }

  const regimeBase = (slot.regrasPrevistas && slot.regrasPrevistas.includes('R2')) ? 'R2' : 'R1';
  const finalSelectedRules = selectedRules || slot.regrasPrevistas || [regimeBase];
  const finalSelectedArea = selectedArea || slot.areaAssumida || (slot.areasFuncoes && slot.areasFuncoes.length > 0 ? slot.areasFuncoes[0] : '');

  const oldAssigneeId = slot.usuarioId;
  const oldUser = users.find(u => u.id === oldAssigneeId);

  const debts = autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE');
  const userHasDebt = debts.length > 0;
  const finalIsPayback = isPayback || userHasDebt;

  // Se a vaga que está sendo substituída era payback do antigo usuário, reverte o payback dele
  if (slot.autotrocaPayback) {
    revertAutotrocaPayback(slot.id);
  }

  // 1. Remover histórico do antigo e qualquer autotroca normal (crédito) associada a ele neste slot
  history = history.filter(h => !(h.usuarioId === oldAssigneeId && h.data === slot.data));
  autotrocas = autotrocas.filter(at => !(at.usuarioId === oldAssigneeId && at.slotId === slotId && at.tipo === 'NORMAL'));

  // 2. Verificar limite mensal de horas de apoio para o novo usuário
  const slotHours = calculateSupportHours(slot.horaInicio || '07:00', slot.horaTermino || '19:00');
  const currentHours = getUserMonthlySupportHours(currentUser.id, slot.data);
  const needsAuthorization = (currentHours + slotHours) > currentConfig.monthlyHoursLimit;
  const monthlyCount = getUserMonthlySupportCount(currentUser.id, slot.data);

  // 3. Reatribuir
  slots = slots.map(s => {
    if (s.id === slotId) {
      const updated = {
        ...s,
        status: 'ATRIBUIDO',
        usuarioId: currentUser.id,
        regrasPrevistas: finalSelectedRules,
        areaAssumida: finalSelectedArea
      };
      if (finalIsPayback) {
        updated.autotrocaPayback = true;
        delete updated.autotroca;
        delete updated.dataFolgaPretendida;
      } else if (isAutotroca) {
        updated.autotroca = true;
        updated.dataFolgaPretendida = folgaDate;
        delete updated.autotrocaPayback;
      } else {
        delete updated.autotroca;
        delete updated.dataFolgaPretendida;
        delete updated.autotrocaPayback;
      }
      if (needsAuthorization) {
        updated.requerAutorizacao = true;
        delete updated.autorizadoPorId;
      } else {
        delete updated.requerAutorizacao;
        delete updated.autorizadoPorId;
      }
      return updated;
    }
    return s;
  });

  // 4. Novo histórico
  const historyId = 'h_' + Date.now();
  
  const supportDate = new Date(slot.data + 'T00:00:00');
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
  const eAtrasado = (currentConfig && currentConfig.penaltiesEnabled) && ((simDate - supportDate) > (3 * 24 * 60 * 60 * 1000));
  const finalRegras = eAtrasado ? ['R13'] : finalSelectedRules;
  const score = calculateSupportScore(finalRegras);

  const subgrupoText = finalIsPayback 
    ? slot.subgrupo + ' (Quitação Autotroca)'
    : (isAutotroca ? slot.subgrupo + ' (Autotroca)' : slot.subgrupo);

  const novoHistorico = {
    id: historyId,
    usuarioId: currentUser.id,
    data: slot.data,
    grupoId: slot.grupoId || '',
    subgrupo: subgrupoText,
    causaRaiz: slot.motivo || 'Composição de Turno',
    regras: finalRegras,
    pontuacao: score,
    dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
    registradoPorId: currentUser.id,
    areaFuncao: finalSelectedArea
  };
  if (isAutotroca && !finalIsPayback) {
    novoHistorico.isAutotroca = true;
  }

  history = [...history, novoHistorico];

  if (finalIsPayback) {
    fulfillAutotrocaPayback(currentUser.id, slot.id, slot.data);
  } else if (isAutotroca) {
    const autotrocaId = 'at_' + Date.now();
    const novaAutotroca = {
      id: autotrocaId,
      usuarioId: currentUser.id,
      tipo: 'NORMAL',
      status: 'PENDENTE_APROVACAO',
      dataSolicitacao: simulatedCurrentDate,
      dataApoio: slot.data,
      dataFolga: folgaDate,
      scheduledPaybackDate: folgaDate,
      paybackFulfilled: false,
      slotId: slot.id,
      historyId: historyId
    };
    autotrocas = [...autotrocas, novaAutotroca];
  }

  if (needsAuthorization) {
    showBanner(`Você substituiu ${oldUser?.nome || 'o colaborador'} por maior prioridade! Este é o seu ${monthlyCount + 1}º apoio no mês. Aguardando autorização.`, 'warning');
  } else {
    showBanner(`Você substituiu ${oldUser?.nome || 'o colaborador'} por maior prioridade!`, 'success');
  }
  
  persistChanges(['slots', 'history', 'autotrocas']);
}

function handleDesistirVaga(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  if (slot.autotrocaPayback) {
    showBanner('Desistência não permitida. Vaga bloqueada para quitação de autotroca. Contate a supervisão.', 'danger');
    return;
  }

  if (slot.data < simulatedCurrentDate) {
    showBanner('Não é possível desistir de vagas de apoio do histórico (datas passadas).', 'danger');
    return;
  }

  if (slot.data === simulatedCurrentDate) {
    showBanner('Desistência não permitida no dia de realização da vaga. Contate a supervisão.', 'danger');
    return;
  }

  const assigneeId = slot.usuarioId;

  // 1. Remover histórico correspondente para este slot/data
  const indexToRemove = history.findIndex(h => h.usuarioId === assigneeId && h.data === slot.data);
  if (indexToRemove !== -1) {
    history.splice(indexToRemove, 1);
  }

  // Remover autotrocas normais (crédito) associadas a esta desistência
  autotrocas = autotrocas.filter(at => !(at.usuarioId === assigneeId && at.slotId === slotId && at.tipo === 'NORMAL'));

  // 2. Liberar a vaga
  slots = slots.map(s => {
    if (s.id === slotId) {
      const updated = {
        ...s,
        status: 'LIVRE',
        usuarioId: null
      };
      delete updated.requerAutorizacao;
      delete updated.autorizadoPorId;
      delete updated.autotroca;
      delete updated.dataFolgaPretendida;
      return updated;
    }
    return s;
  });

  showBanner('Você desistiu do apoio. A vaga está disponível novamente.', 'info');
  persistChanges(['slots', 'history', 'autotrocas']);
}

// --- AUTORIZAÇÃO GERENCIAL (Limite de 3 apoios/mês) ---

function handleAutorizarApoio(slotId) {
  if (!isCurrentUserGestor()) {
    showBanner('Apenas Supervisores, Gerentes e Administradores podem autorizar apoios.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  slots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, requerAutorizacao: false, autorizadoPorId: currentUser.id };
    }
    return s;
  });

  const user = users.find(u => u.id === slot.usuarioId);
  showBanner(`Apoio de ${user?.nome || 'colaborador'} em ${formatDatePt(slot.data)} autorizado com sucesso!`, 'success');
  persistChanges('slots');
}

function handleRejeitarAutorizacao(slotId) {
  if (!isCurrentUserGestor()) {
    showBanner('Apenas Supervisores, Gerentes e Administradores podem rejeitar autorizações.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const user = users.find(u => u.id === slot.usuarioId);

  if (confirm(`Rejeitar o apoio de ${user?.nome || 'colaborador'} em ${formatDatePt(slot.data)}? Isso liberará a vaga e removerá o histórico associado.`)) {
    // 1. Remover histórico associado
    history = history.filter(h => !(h.usuarioId === slot.usuarioId && h.data === slot.data));

    // 2. Resetar o slot
    slots = slots.map(s => {
      if (s.id === slotId) {
        return { ...s, status: 'LIVRE', usuarioId: null, requerAutorizacao: undefined, autorizadoPorId: undefined };
      }
      return s;
    });

    showBanner(`Autorização rejeitada. Vaga de ${formatDatePt(slot.data)} liberada novamente.`, 'info');
    persistChanges(['slots', 'history']);
  }
}

function handleIniciarEdicaoHistorico(historyId) {
  const item = history.find(h => h.id === historyId);
  if (!item) return;

  editingHistoryId = historyId;
  switchView('registro');

  regUsuarioSelect.value = item.usuarioId;
  if (regGrupoSelect && item.grupoId) {
    regGrupoSelect.value = item.grupoId;
  }
  
  let subgrupoVal = item.subgrupo || '';
  subgrupoVal = subgrupoVal.replace(' (Autotroca)', '').replace(' (Quitação Autotroca)', '');
  regSubgrupoInput.value = subgrupoVal;
  
  regDataInput.value = item.data;
  if (regHoraInicioInput) regHoraInicioInput.value = item.horaInicio || '07:00';
  if (regHoraTerminoInput) regHoraTerminoInput.value = item.horaTermino || '19:00';

  // Se for autotroca, carregar os dados correspondentes
  const isAutotroca = !!item.isAutotroca;
  if (regIsAutotrocaCheckbox) {
    regIsAutotrocaCheckbox.checked = isAutotroca;
  }
  if (containerRegDataFolga) {
    containerRegDataFolga.style.display = isAutotroca ? 'block' : 'none';
  }
  if (regDataFolgaInput) {
    regDataFolgaInput.required = isAutotroca;
    
    // Buscar a autotroca correspondente para preencher a data da folga
    const at = autotrocas.find(a => 
      a.historyId === historyId || 
      (a.usuarioId === item.usuarioId && a.dataApoio === item.data && a.tipo === 'NORMAL')
    );
    regDataFolgaInput.value = at ? (at.dataFolga || '') : '';
  }

  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => {
    cb.checked = item.regras.includes(cb.value);
  });

  const regAreas = item.areasFuncoes || [];
  document.querySelectorAll('input[name="reg-areas-funcoes"]').forEach(cb => {
    cb.checked = regAreas.includes(cb.value);
  });

  regFormTitle.textContent = 'Editar Apoio Concluído';
  btnCancelEditReg.style.display = 'inline-flex';
  btnSubmitReg.textContent = '💾 Salvar Alterações e Recalcular Ranking';

  checkLateSubmission();
  updatePointsPreview();
}

function handleCancelarEdicaoApoio() {
  editingHistoryId = null;
  regSubgrupoInput.value = '';
  regDataInput.value = '';
  if (regHoraInicioInput) regHoraInicioInput.value = '07:00';
  if (regHoraTerminoInput) regHoraTerminoInput.value = '19:00';
  if (regGrupoSelect) regGrupoSelect.selectedIndex = 0;
  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="reg-areas-funcoes"]').forEach(cb => cb.checked = false);
  if (regBypassLimit) regBypassLimit.checked = false;
  if (regIsAutotrocaCheckbox) regIsAutotrocaCheckbox.checked = false;
  if (regDataFolgaInput) regDataFolgaInput.value = '';
  if (containerRegDataFolga) containerRegDataFolga.style.display = 'none';
  
  switchView('historico');
}

// --- CONTROLE DE MUDANÇA DE CONFIGURAÇÃO SIMULADA ---

function handleRoleChange(e) {
  currentUserId = e.target.value;
  currentUser = users.find(u => u.id === currentUserId);
  renderAll();
  
  // Se mudar para operador na aba de usuários, move para escalas
  const isGestor = isCurrentUserGestor();
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
}// --- CÁLCULOS DA LEI DE APOIO (FÓRMULAS OFICIAIS) ---

function calculateSupportScore(regrasArray) {
  if (regrasArray.length === 0) return 0.0;
  
  let prod = 1.0;
  regrasArray.forEach(rid => {
    const rule = supportRules.find(r => r.id === rid);
    if (rule) {
      prod *= (rule.peso / 10);
    }
  });
  
  return parseFloat(prod.toFixed(4));
}

function calculateSupportHours(horaInicio, horaTermino) {
  if (!horaInicio || !horaTermino) return 0;
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaTermino.split(':').map(Number);
  let startMin = h1 * 60 + m1;
  let endMin = h2 * 60 + m2;
  if (endMin < startMin) {
    endMin += 24 * 60; // Overnight
  }
  return parseFloat(((endMin - startMin) / 60).toFixed(2));
}

function getUserLastSupportDate(userId) {
  const userHistory = history.filter(h => h.usuarioId === userId);
  if (userHistory.length === 0) return null;
  
  userHistory.sort((a, b) => {
    const parsedA = parseDateRobust(a.data);
    const parsedB = parseDateRobust(b.data);
    if (!parsedA && !parsedB) return 0;
    if (!parsedA) return 1;
    if (!parsedB) return -1;
    return parsedB - parsedA;
  });
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

// Conta quantos apoios o usuário tem em um determinado mês (baseado na data do apoio)
function getUserMonthlySupportCount(userId, dateStr) {
  if (!dateStr) return 0;
  const targetMonth = dateStr.substring(0, 7); // YYYY-MM
  return history.filter(h =>
    h.usuarioId === userId &&
    h.data && h.data.substring(0, 7) === targetMonth
  ).length;
}

// Soma o total de horas de apoio do usuário em um determinado mês
function getUserMonthlySupportHours(userId, dateStr) {
  if (!dateStr) return 0;
  const targetMonth = dateStr.substring(0, 7); // YYYY-MM
  return history.filter(h =>
    h.usuarioId === userId &&
    h.data && h.data.substring(0, 7) === targetMonth
  ).reduce((sum, h) => sum + (h.totalHoras || 0), 0);
}

function getDisputeWinner(slotId) {
  const candIds = candidatos[slotId] || [];
  if (candIds.length === 0) return null;

  const sortedIds = [...candIds].sort((a, b) => {
    if (hasHigherPriority(a, b)) return -1;
    if (hasHigherPriority(b, a)) return 1;
    return 0;
  });

  const winnerId = sortedIds[0];
  const u = users.find(user => user.id === winnerId);
  const score = calculateUserPointsGeral(winnerId);
  return { id: winnerId, nome: u?.nome || 'Desconhecido', score };
}

// --- RENDERIZADORES DE TELA (HTML DINÂMICO) ---

function renderAll() {
  // Re-renderizar checklists de áreas com base na configuração atualizada
  renderAreasCheckboxList('user-areas-checkboxes-container', 'user-areas-funcoes');
  renderAreasCheckboxList('slot-areas-checkboxes-container', 'slot-areas-funcoes');
  renderAreasCheckboxList('reg-areas-checkboxes-container', 'reg-areas-funcoes');
  renderAreasCheckboxList('operator-areas-checkboxes-container', 'operator-areas-funcoes');

  renderRoleSelect();
  renderTabs();
  renderAdminBar();
  renderSlots();
  renderMyPanel();
  renderRanking();
  renderFormGroupsOptions();
  populateHistoryFilterUsers();
  populateAuditoriaFilterUsers();
  renderMinhasAutotrocas();
  renderCalendarView();

  if (isCurrentUserGestor()) {
    renderAuditoriaTable();
    if (currentView === 'relatorios') {
      renderRelatorios();
    }
    if (currentView === 'configuracoes') {
      renderConfiguracoes();
    }
  }
}

function populateAuditoriaFilterUsers() {
  const filterSelect = document.getElementById('auditoria-filter-user');
  if (!filterSelect) return;

  const currentValue = filterSelect.value || 'all';
  const sortedUsers = [...users].sort((a, b) => a.nome.localeCompare(b.nome));

  let html = '<option value="all">-- Todos --</option>';
  sortedUsers.forEach(u => {
    html += `<option value="${u.id}">${u.nome} (${u.id.toUpperCase()})</option>`;
  });

  filterSelect.innerHTML = html;
  filterSelect.value = currentValue;
}

function renderAuditoriaTable() {
  const tableBody = document.getElementById('auditoria-table-body');
  if (!tableBody) return;

  // Ler filtros
  const filterUser = document.getElementById('auditoria-filter-user')?.value || 'all';
  const filterStatus = document.getElementById('auditoria-filter-status')?.value || 'all';
  const filterDateStart = document.getElementById('auditoria-filter-date-start')?.value || '';
  const filterDateEnd = document.getElementById('auditoria-filter-date-end')?.value || '';

  // Filtrar apenas os slots (escalas) que foram confirmados (ATRIBUIDO)
  let assignedSlots = slots.filter(s => s.status === 'ATRIBUIDO');

  // Aplicar filtro de usuário
  if (filterUser !== 'all') {
    assignedSlots = assignedSlots.filter(s => s.usuarioId === filterUser);
  }

  // Aplicar filtro de data
  if (filterDateStart) {
    assignedSlots = assignedSlots.filter(s => s.data >= filterDateStart);
  }
  if (filterDateEnd) {
    assignedSlots = assignedSlots.filter(s => s.data <= filterDateEnd);
  }

  // Calcular estatísticas antes do filtro de status
  let totalSlots = assignedSlots.length;
  let totalLancados = 0;
  let totalNaoLancados = 0;

  // Pré-calcular lançamentos para cada slot
  const slotsWithStatus = assignedSlots.map(s => {
    const matchingHistory = history.filter(h =>
      h.usuarioId === s.usuarioId &&
      h.data === s.data
    );
    const hasMatching = matchingHistory.length > 0;
    if (hasMatching) totalLancados++;
    else totalNaoLancados++;
    return { slot: s, matchingHistory, hasMatching };
  });

  // Aplicar filtro de status
  let filteredResults = slotsWithStatus;
  if (filterStatus === 'lancado') {
    filteredResults = slotsWithStatus.filter(r => r.hasMatching);
  } else if (filterStatus === 'nao_lancado') {
    filteredResults = slotsWithStatus.filter(r => !r.hasMatching);
  }

  // Atualizar resumo
  const summaryEl = document.getElementById('auditoria-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid var(--border-color);">
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Total Escalados</span>
        <strong style="font-size: 1.3rem; color: var(--text-primary);">${totalSlots}</strong>
      </div>
      <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid hsla(142, 72%, 45%, 0.3);">
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Lançados ✓</span>
        <strong style="font-size: 1.3rem; color: var(--success);">${totalLancados}</strong>
      </div>
      <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid hsla(0, 84%, 60%, 0.3);">
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Não Lançados ⚠️</span>
        <strong style="font-size: 1.3rem; color: var(--danger);">${totalNaoLancados}</strong>
      </div>
      <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid var(--border-color);">
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Conformidade</span>
        <strong style="font-size: 1.3rem; color: ${totalSlots > 0 && totalNaoLancados === 0 ? 'var(--success)' : totalNaoLancados > 0 ? 'var(--warning)' : 'var(--text-primary)'}">${totalSlots > 0 ? Math.round((totalLancados / totalSlots) * 100) : 0}%</strong>
      </div>
    `;
  }

  if (filteredResults.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">
          Nenhum apoio solicitado corresponde aos filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  // Ordenar slots por data decrescente
  filteredResults.sort((a, b) => new Date(b.slot.data) - new Date(a.slot.data));

  let html = '';

  filteredResults.forEach(({ slot: s, matchingHistory, hasMatching }) => {
    const user = users.find(u => u.id === s.usuarioId);
    const group = groups.find(g => g.id === s.grupoId);

    let statusText = '';
    let statusBadgeClass = '';
    let historyDetails = '';
    let registradoPorText = '';

    if (hasMatching) {
      statusText = 'Lançado ✓';
      statusBadgeClass = 'badge badge-open';

      // Detalhes do registro encontrado no histórico
      historyDetails = matchingHistory.map(h => {
        const regrasText = h.regras.map(r => {
          const ruleObj = supportRules.find(rule => rule.id === r);
          return ruleObj ? ruleObj.descricao : r;
        }).join(', ');
        return `
          <div style="font-size: 0.75rem; color: var(--success); margin-top: 4px;">
            <strong>Lançado em:</strong> ${formatDatePt(h.data)}<br>
            <strong>Regras/Pontos:</strong> ${regrasText} (${h.pontuacao.toFixed(2)} pts)<br>
            <strong>ID Registro:</strong> ${h.id}
          </div>
        `;
      }).join('<hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 6px 0;">');

      // Quem registrou
      const registrador = matchingHistory[0];
      if (registrador && registrador.registradoPorId) {
        const regUser = users.find(u => u.id === registrador.registradoPorId);
        registradoPorText = `
          <div style="font-size: 0.78rem;">
            <strong>${regUser ? regUser.nome : registrador.registradoPorId}</strong><br>
            <span style="font-size: 0.7rem; color: var(--text-muted);">
              Em: ${registrador.dataRegistro ? formatDatePt(registrador.dataRegistro.split('T')[0]) : '-'}
            </span>
          </div>
        `;
      } else {
        registradoPorText = '<span style="color: var(--text-muted); font-size: 0.75rem;">Sistema</span>';
      }
    } else {
      statusText = 'Não Lançado ⚠️';
      statusBadgeClass = 'badge badge-cancelled';
      historyDetails = `
        <div style="font-size: 0.75rem; color: var(--danger); margin-top: 4px;">
          Nenhum lançamento encontrado para este operador nesta data.
        </div>
      `;
      registradoPorText = '<span style="color: var(--danger); font-size: 0.75rem;">—</span>';
    }

    html += `
      <tr>
        <td style="font-weight: 600;">${formatDatePt(s.data)}</td>
        <td>${group ? group.nome : s.grupoId} (${s.subgrupo})</td>
        <td>${s.horario}</td>
        <td>
          <strong>${user ? user.nome : 'Desconhecido'}</strong><br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${user ? user.cargo : ''} (${s.usuarioId})</span>
        </td>
        <td>${registradoPorText}</td>
        <td style="max-width: 300px; text-align: left; vertical-align: top;">
          ${historyDetails}
        </td>
        <td>
          <span class="${statusBadgeClass}">
            ${statusText}
          </span>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

function populateAutotrocasFilterUsers() {
  const selectFilter = document.getElementById('autotroca-filter-user');
  if (!selectFilter) return;

  const prevValue = selectFilter.value;
  let html = '<option value="all">-- Todos os Colaboradores --</option>';
  
  const sortedRegUsers = [...users]
    .filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .sort((a, b) => a.nome.localeCompare(b.nome));

  sortedRegUsers.forEach(u => {
    html += `<option value="${u.id}">${u.nome}</option>`;
  });

  selectFilter.innerHTML = html;
  if (prevValue && selectFilter.querySelector(`option[value="${prevValue}"]`)) {
    selectFilter.value = prevValue;
  }
}

function populateAutotrocaContrariaUsers() {
  const selectUser = document.getElementById('at-usuario');
  if (!selectUser) return;

  let html = '';
  const sortedRegUsers = [...users]
    .filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .sort((a, b) => a.nome.localeCompare(b.nome));

  sortedRegUsers.forEach(u => {
    html += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });

  selectUser.innerHTML = html;
}



function renderAutotrocasSummary(filteredList) {
  const summaryEl = document.getElementById('autotrocas-summary');
  if (!summaryEl) return;

  const totalDebito = autotrocas.filter(at => at.tipo === 'CONTRARIA' && at.status === 'PENDENTE').length;
  const totalCreditoPendente = autotrocas.filter(at => at.tipo === 'NORMAL' && at.status === 'PENDENTE_APROVACAO').length;
  const totalCreditoAprovado = autotrocas.filter(at => at.tipo === 'NORMAL' && at.status === 'APROVADA').length;
  const totalConcluidas = autotrocas.filter(at => at.status === 'CONCLUIDO').length;

  summaryEl.innerHTML = `
    <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid hsla(38, 92%, 50%, 0.3);">
      <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Em Débito (Devem Apoio)</span>
      <strong style="font-size: 1.3rem; color: var(--warning);">${totalDebito}</strong>
    </div>
    <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid hsla(190, 90%, 50%, 0.3);">
      <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Pendentes de Folga</span>
      <strong style="font-size: 1.3rem; color: var(--info);">${totalCreditoPendente}</strong>
    </div>
    <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid hsla(142, 72%, 45%, 0.3);">
      <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Folgas Aprovadas</span>
      <strong style="font-size: 1.3rem; color: var(--success);">${totalCreditoAprovado}</strong>
    </div>
    <div class="glass-panel" style="padding: 12px 16px; text-align: center; border: 1px solid var(--border-color);">
      <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Operações Concluídas</span>
      <strong style="font-size: 1.3rem; color: var(--text-secondary);">${totalConcluidas}</strong>
    </div>
  `;
}

function renderMinhasAutotrocas() {
  if (!currentUser) return;

  const userAutos = autotrocas.filter(at => at.usuarioId === currentUser.id);

  // Calcular Saldo de Folgas Úteis (Normais aprovadas)
  const saldoFolgas = userAutos.filter(at => at.tipo === 'NORMAL' && at.status === 'APROVADA').length;
  // Folgas em aprovação (Normais pendentes)
  const folgasPendentes = userAutos.filter(at => at.tipo === 'NORMAL' && at.status === 'PENDENTE_APROVACAO').length;
  // Apoios em débito (Contrárias pendentes)
  const apoiosDebitos = userAutos.filter(at => at.tipo === 'CONTRARIA' && at.status === 'PENDENTE').length;

  if (minhasFolgasSaldoVal) minhasFolgasSaldoVal.textContent = saldoFolgas;
  if (minhasFolgasPendentesVal) minhasFolgasPendentesVal.textContent = folgasPendentes;
  if (meusApoiosDebitosVal) meusApoiosDebitosVal.textContent = apoiosDebitos;

  if (!minhasAutotrocasTableBody) return;

  // Ordenar: pendentes primeiro, depois aprovadas, por fim concluídas
  const sorted = [...userAutos].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'PENDENTE' || a.status === 'PENDENTE_APROVACAO') return -1;
      if (b.status === 'PENDENTE' || b.status === 'PENDENTE_APROVACAO') return 1;
      if (a.status === 'APROVADA') return -1;
      if (b.status === 'APROVADA') return 1;
    }
    return new Date(b.dataSolicitacao || '') - new Date(a.dataSolicitacao || '');
  });

  let html = '';
  let mobileHtml = '';
  if (sorted.length === 0) {
    html = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 20px;">Nenhum lançamento de autotroca encontrado.</td></tr>';
    mobileHtml = '<div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 20px;">Nenhum lançamento de autotroca encontrado.</div>';
  } else {
    sorted.forEach(at => {
      const isNormal = at.tipo === 'NORMAL';
      
      const typeLabel = isNormal 
        ? '<span class="badge" style="background: rgba(99, 102, 241, 0.15); color: var(--info); border: 1px solid var(--info);">🟢 Crédito (Folga)</span>'
        : '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid var(--warning);">🔴 Débito (Apoio)</span>';

      const dataSolicitacao = at.dataSolicitacao ? formatDatePt(at.dataSolicitacao) : '-';
      const dataApoio = at.dataApoio ? formatDatePt(at.dataApoio) : '<span style="color: var(--text-muted); font-style: italic;">Pendente</span>';
      const dataFolga = at.dataFolga ? formatDatePt(at.dataFolga) : '<span style="color: var(--text-muted); font-style: italic;">Pendente</span>';

      let statusBadge = '';
      if (at.status === 'PENDENTE_APROVACAO') {
        statusBadge = '<span class="badge badge-pending">Aguardando Aprov.</span>';
      } else if (at.status === 'PENDENTE') {
        statusBadge = '<span class="badge badge-pending" style="color: var(--warning); border-color: var(--warning);">Débito Pendente</span>';
      } else if (at.status === 'APROVADA') {
        statusBadge = '<span class="badge badge-open">Folga Liberada</span>';
      } else if (at.status === 'CONCLUIDO') {
        statusBadge = '<span class="badge badge-concluido">Concluída (Quitada)</span>';
      }

      let prazoLabel = '-';
      let prazoMobile = '-';
      if (at.tipo === 'CONTRARIA' && at.status === 'PENDENTE') {
        const days = getDebtExpirationDays(at, simulatedCurrentDate);
        if (days < 0) {
          prazoLabel = `<span style="color: var(--danger); font-weight: bold;">⚠️ Vencido (há ${Math.abs(days)} dias)</span>`;
          prazoMobile = `⚠️ Vencido (há ${Math.abs(days)} dias)`;
        } else {
          prazoLabel = `<span style="color: var(--success); font-weight: bold;">⏳ Restam ${days} dias</span>`;
          prazoMobile = `⏳ Restam ${days} dias`;
        }
      }

      html += `
        <tr>
          <td>${typeLabel}</td>
          <td>${dataSolicitacao}</td>
          <td>${dataApoio}</td>
          <td>${dataFolga}</td>
          <td>${statusBadge}</td>
          <td>${prazoLabel}</td>
        </tr>
      `;

      mobileHtml += `
        <div class="glass-panel" style="padding: 16px; display: flex; flex-direction: column; gap: 8px; border-left: 4px solid ${isNormal ? 'var(--info)' : 'var(--warning)'}; background: var(--bg-card); margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.9rem;">${isNormal ? '🟢 Crédito (Folga)' : '🔴 Débito (Apoio)'}</strong>
            ${statusBadge}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.8rem; margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 8px;">
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 0.72rem;">Solicitação:</span>
              <strong>${dataSolicitacao}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 0.72rem;">Apoio Realizado:</span>
              <strong>${dataApoio}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 0.72rem;">Folga Marcada:</span>
              <strong>${dataFolga}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 0.72rem;">Vencimento:</span>
              <strong style="color: ${prazoMobile.includes('Vencido') ? 'var(--danger)' : 'var(--text-primary)'}">${prazoMobile}</strong>
            </div>
          </div>
        </div>
      `;
    });
  }

  minhasAutotrocasTableBody.innerHTML = html;
  if (minhasAutotrocasMobileCards) {
    minhasAutotrocasMobileCards.innerHTML = mobileHtml;
  }
}

function renderAutotrocasTable() {
  const tableBody = document.getElementById('autotrocas-table-body');
  if (!tableBody) return;

  populateAutotrocasFilterUsers();
  populateAutotrocaContrariaUsers();

  const filterUser = document.getElementById('autotroca-filter-user')?.value || 'all';
  const filterStatus = document.getElementById('autotroca-filter-status')?.value || 'all';

  let filtered = [...autotrocas];

  if (filterUser !== 'all') {
    filtered = filtered.filter(at => at.usuarioId === filterUser);
  }

  if (filterStatus !== 'all') {
    if (filterStatus === 'debito') {
      filtered = filtered.filter(at => at.tipo === 'CONTRARIA' && at.status === 'PENDENTE');
    } else if (filterStatus === 'credito_pendente') {
      filtered = filtered.filter(at => at.tipo === 'NORMAL' && at.status === 'PENDENTE_APROVACAO');
    } else if (filterStatus === 'credito_aprovado') {
      filtered = filtered.filter(at => at.tipo === 'NORMAL' && at.status === 'APROVADA');
    } else if (filterStatus === 'concluido') {
      filtered = filtered.filter(at => at.status === 'CONCLUIDO');
    }
  }

  filtered.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'CONCLUIDO') return 1;
      if (b.status === 'CONCLUIDO') return -1;
    }
    return new Date(b.dataSolicitacao || '') - new Date(a.dataSolicitacao || '');
  });

  renderAutotrocasSummary(filtered);

  let html = '';
  filtered.forEach(at => {
    const user = users.find(u => u.id === at.usuarioId);
    const userName = user ? user.nome : 'Desconhecido';
    
    const isNormal = at.tipo === 'NORMAL';
    const typeLabel = isNormal 
      ? '<span class="badge badge-info" style="background: rgba(99, 102, 241, 0.15); color: var(--info); border: 1px solid var(--info);">🔄 Normal (Apoio ➔ Folga)</span>'
      : '<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid var(--warning);">⏳ Contrária (Folga ➔ Apoio)</span>';

    const dataApoioLabel = at.dataApoio ? formatDatePt(at.dataApoio) : '<span style="color: var(--text-muted);">Pendente</span>';
    const dataFolgaLabel = at.dataFolga ? formatDatePt(at.dataFolga) : '<span style="color: var(--text-muted);">Pendente</span>';

    let statusBadge = '';
    let actionsHtml = '';

    if (at.status === 'PENDENTE_APROVACAO') {
      statusBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid var(--danger);">Aguardando Aprov. Folga</span>';
      actionsHtml = `
        <button class="btn btn-primary btn-at-aprovar" style="padding: 4px 8px; font-size: 0.72rem; background: var(--success); border: none;" data-at-id="${at.id}">✅ Aprovar Folga</button>
      `;
    } else if (at.status === 'APROVADA') {
      statusBadge = '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid var(--success);">Folga Aprovada</span>';
      actionsHtml = `
        <button class="btn btn-primary btn-at-concluir" style="padding: 4px 8px; font-size: 0.72rem; background: var(--info); border: none;" data-at-id="${at.id}">✓ Confirmar Gozo de Folga</button>
      `;
    } else if (at.status === 'PENDENTE' && at.tipo === 'CONTRARIA') {
      statusBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid var(--warning);">Em Débito</span>';
      actionsHtml = `<span style="font-size: 0.75rem; color: var(--text-muted);">Escalar no painel para quitar</span>`;
    } else {
      statusBadge = '<span class="badge badge-concluido">✓ Concluído</span>';
      actionsHtml = `<span style="font-size: 0.75rem; color: var(--text-muted);">-</span>`;
    }

    actionsHtml += `
      <button class="btn btn-danger btn-at-excluir" style="padding: 4px 8px; font-size: 0.72rem; margin-left: 6px;" data-at-id="${at.id}">✕ Excluir</button>
    `;

    html += `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${userName}</td>
        <td>${typeLabel}</td>
        <td>${dataApoioLabel}</td>
        <td>${dataFolgaLabel}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center; white-space: nowrap;">
          ${actionsHtml}
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Nenhum registro encontrado.</td></tr>';

  tableBody.querySelectorAll('.btn-at-aprovar').forEach(btn => {
    btn.addEventListener('click', () => handleAprovarFolga(btn.getAttribute('data-at-id')));
  });

  tableBody.querySelectorAll('.btn-at-concluir').forEach(btn => {
    btn.addEventListener('click', () => handleConcluirFolga(btn.getAttribute('data-at-id')));
  });

  tableBody.querySelectorAll('.btn-at-excluir').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteAutotroca(btn.getAttribute('data-at-id')));
  });
}

function handleAprovarFolga(atId) {
  autotrocas = autotrocas.map(at => {
    if (at.id === atId) {
      return { ...at, status: 'APROVADA' };
    }
    return at;
  });
  showBanner('Solicitação de folga aprovada com sucesso!', 'success');
  persistChanges('autotrocas');
  renderAutotrocasTable();
  renderMyPanel();
}

function handleConcluirFolga(atId) {
  autotrocas = autotrocas.map(at => {
    if (at.id === atId) {
      return { ...at, status: 'CONCLUIDO', paybackFulfilled: true };
    }
    return at;
  });
  showBanner('Folga marcada como gozada. Autotroca concluída!', 'success');
  persistChanges('autotrocas');
  renderAutotrocasTable();
  renderMyPanel();
}

function handleDeleteAutotroca(atId) {
  if (!confirm('Deseja realmente excluir este registro de autotrocra?')) return;
  autotrocas = autotrocas.filter(at => at.id !== atId);
  showBanner('Registro de autotrocra excluído.', 'success');
  persistChanges('autotrocas');
  renderAutotrocasTable();
  renderMyPanel();
}

function handleSaveAutotrocaContraria(e) {
  e.preventDefault();

  const userId = atUsuarioSelect.value;
  const dataFolga = atDataFolgaInput.value;

  if (!userId || !dataFolga) {
    showBanner('Preencha todos os campos.', 'danger');
    return;
  }

  const user = users.find(u => u.id === userId);
  if (!user) return;

  const autotrocaId = 'at_' + Date.now();
  const novaAutotroca = {
    id: autotrocaId,
    usuarioId: userId,
    tipo: 'CONTRARIA',
    status: 'PENDENTE',
    dataSolicitacao: simulatedCurrentDate,
    dataApoio: '',
    dataFolga: dataFolga,
    scheduledPaybackDate: '',
    paybackFulfilled: false,
    slotId: ''
  };

  autotrocas = [...autotrocas, novaAutotroca];
  persistChanges('autotrocas');
  autotrocaContrariaModal.style.display = 'none';
  atDataFolgaInput.value = '';
  showBanner(`Folga de ${user.nome} registrada! Operador entrou em débito de apoio.`, 'warning');
  
  renderAutotrocasTable();
  renderMyPanel();
}

function renderRoleSelect() {
  if (!roleSelect) return;
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
    const score = calculateUserPointsGeral(u.id);
    const isExcluido = u.cargo === 'GPI' || u.cargo === 'OPMAN';
    const scoreLabel = isExcluido ? 'Sem Classif.' : `${score.toFixed(2)} pts`;
    html += `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>
      ${u.nome} (${u.cargo} | ${scoreLabel} | ${u.tipo})
    </option>`;
  });
  html += '</optgroup>';
  
  roleSelect.innerHTML = html;
}

function renderTabs() {
  const isGestor = isCurrentUserGestor();
  
  // Mostrar/esconder abas de gestão com base na hierarquia
  const drawerBtnAutotrocas = document.getElementById('drawer-btn-autotrocas');
  const drawerBtnUsuarios = document.getElementById('drawer-btn-usuarios');
  const drawerBtnAuditoria = document.getElementById('drawer-btn-auditoria');
  const drawerBtnRelatorios = document.getElementById('drawer-btn-relatorios');
  const drawerBtnConfiguracoes = document.getElementById('drawer-btn-configuracoes');

  if (isGestor) {
    tabBtnUsuarios.style.display = 'inline-flex';
    if (tabBtnAuditoria) tabBtnAuditoria.style.display = 'inline-flex';
    if (tabBtnRelatorios) tabBtnRelatorios.style.display = 'inline-flex';
    if (tabBtnAutotrocas) tabBtnAutotrocas.style.display = 'inline-flex';
    if (tabBtnConfiguracoes) tabBtnConfiguracoes.style.display = 'inline-flex';

    if (drawerBtnAutotrocas) drawerBtnAutotrocas.style.display = 'flex';
    if (drawerBtnUsuarios) drawerBtnUsuarios.style.display = 'flex';
    if (drawerBtnAuditoria) drawerBtnAuditoria.style.display = 'flex';
    if (drawerBtnRelatorios) drawerBtnRelatorios.style.display = 'flex';
    if (drawerBtnConfiguracoes) drawerBtnConfiguracoes.style.display = 'flex';
  } else {
    tabBtnUsuarios.style.display = 'none';
    if (tabBtnAuditoria) tabBtnAuditoria.style.display = 'none';
    if (tabBtnRelatorios) tabBtnRelatorios.style.display = 'none';
    if (tabBtnAutotrocas) tabBtnAutotrocas.style.display = 'none';
    if (tabBtnConfiguracoes) tabBtnConfiguracoes.style.display = 'none';

    if (drawerBtnAutotrocas) drawerBtnAutotrocas.style.display = 'none';
    if (drawerBtnUsuarios) drawerBtnUsuarios.style.display = 'none';
    if (drawerBtnAuditoria) drawerBtnAuditoria.style.display = 'none';
    if (drawerBtnRelatorios) drawerBtnRelatorios.style.display = 'none';
    if (drawerBtnConfiguracoes) drawerBtnConfiguracoes.style.display = 'none';
  }

  const isOperador = isCurrentUserOperador();
  const dateFilterContainer = document.getElementById('date-filter-container');

  if (isOperador) {
    if (dateFilterContainer) dateFilterContainer.style.display = 'none';
    tabContainer.style.display = 'none';
    
    escalaDateFilter = 'future';
    activeTab = 'all';
    
    if (btnDateFuture) btnDateFuture.classList.add('active');
    if (btnDatePast) btnDatePast.classList.remove('active');
  } else {
    if (dateFilterContainer) dateFilterContainer.style.display = 'flex';
    tabContainer.style.display = 'flex';
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
  const isGestor = isCurrentUserGestor();
  
  if (isGestor) {
    adminActionsBar.style.display = 'flex';
    
    // Configurar botões específicos conforme cargo
    const btnCreate = document.getElementById('btn-open-add-modal');
    // Admin, Gerente e Supervisor criam escala
    if (isCurrentUserGestor()) {
      btnCreate.style.display = 'inline-flex';
    } else {
      btnCreate.style.display = 'none';
    }

    // Apenas Admin e Gerente aplicavam multas de WhatsApp, mas agora está oculto para todos
    const btnInfracao = document.getElementById('btn-open-infracao-modal');
    if (btnInfracao) {
      btnInfracao.style.display = 'none';
    }

    // Apenas Admin abre o modal de importação/exportação CSV
    if (btnOpenCsvModal) {
      if (isCurrentUserAdminOnly()) {
        btnOpenCsvModal.style.display = 'inline-flex';
      } else {
        btnOpenCsvModal.style.display = 'none';
      }
    }
  } else {
    adminActionsBar.style.display = 'none';
  }
}

function getSlotCardHtml(slot) {
  const isDisputa = false; // Vagas são apenas de acesso Direto
  const candList = [];
  const vencedor = getDisputeWinner(slot.id);
  const apontee = users.find(u => u.id === slot.usuarioId);
  
  // Características previstas
  const regrasPrevistas = slot.regrasPrevistas || [];
  const pesoPrevisao = calculateSupportScore(regrasPrevistas);

  const isPast = slot.data < simulatedCurrentDate;
  const cardStatusClass = isPast ? 'concluido' : (isDisputa ? 'pendente' : slot.status.toLowerCase());
  const isSelfSlot = currentUser && slot.usuarioId === currentUser.id;

  return `
    <div class="slot-card glass-panel status-${cardStatusClass} ${isSelfSlot ? 'my-assigned-slot' : ''}">
      <div class="slot-meta">
        <span class="slot-subgrupo">${slot.subgrupo}</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${slot.autotroca ? `<span class="badge" style="background: rgba(99, 102, 241, 0.2); color: var(--info); border: 1px solid var(--info); font-size: 0.65rem; padding: 2px 6px;">🔄 Autotroca</span>` : ''}
          ${slot.autotrocaPayback ? `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: var(--warning); border: 1px solid var(--warning); font-size: 0.65rem; padding: 2px 6px;">🔒 Quitação Débito</span>` : ''}
          ${isDisputa ? `
            <span class="badge badge-pending">Em Disputa</span>
          ` : `
            <span class="badge ${isPast ? 'badge-concluido' : (isSelfSlot ? 'badge-self' : `badge-${slot.status.toLowerCase()}`)}">
              ${isPast ? 'Concluído' : (slot.status === 'LIVRE' ? 'Disponível' : 
                slot.status === 'CANCELADO' ? 'Cancelado' : (isSelfSlot ? 'Seu Apoio ⭐' : 'Fechada'))}
            </span>
          `}
        </div>
      </div>

      <div class="slot-schedule">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        <span>${formatDatePt(slot.data)}</span>
        ${slot.horaInicio && slot.horaTermino ? `
          <span>•</span>
          <span class="slot-hours">⏱️ ${slot.horaInicio} às ${slot.horaTermino} (${calculateSupportHours(slot.horaInicio, slot.horaTermino)}h)</span>
        ` : ''}
      </div>

      ${slot.motivo ? `
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px;">
          <strong>🔍 Causa Raiz:</strong> <span class="badge" style="font-size: 0.7rem; padding: 2px 6px; background: hsla(160, 50%, 40%, 0.15); border: 1px solid hsla(160, 50%, 40%, 0.25); color: hsl(160, 80%, 75%);">${slot.motivo}</span>
        </div>
      ` : ''}

      ${slot.areaAssumida ? `
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px;">
          <strong>📍 Área Assumida:</strong> <span class="badge" style="font-size: 0.7rem; padding: 2px 6px; background: hsla(190, 90%, 50%, 0.15); border: 1px solid var(--info); color: var(--info); font-weight: 600; text-transform: uppercase;">${slot.areaAssumida}</span>
        </div>
      ` : `
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">
          <strong>Áreas/Funções Oferecidas:</strong> 
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; margin-bottom: 8px;">
            ${(slot.areasFuncoes || []).map(area => `<span class="badge" style="font-size: 0.65rem; padding: 2px 6px; background: hsla(220, 50%, 50%, 0.15); border: 1px solid hsla(220, 50%, 50%, 0.25); text-transform: uppercase; color: hsl(220, 50%, 80%);">${area}</span>`).join('') || '<span style="font-style: italic; color: var(--text-muted);">Não direcionada</span>'}
          </div>
        </div>
      `}

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
            ${(() => {
              const sortedCands = [...candList].sort((a, b) => {
                if (hasHigherPriority(a, b)) return -1;
                if (hasHigherPriority(b, a)) return 1;
                return 0;
              });
              return sortedCands.map((cid, i) => {
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
              }).join('');
            })()}
            ${candList.length === 0 ? `
              <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
                Nenhum voluntário inscrito na fila.
              </span>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Se já estiver preenchido -->
      ${!isDisputa && slot.usuarioId ? (() => {
        const monthlyCount = getUserMonthlySupportCount(slot.usuarioId, slot.data);
        const needsAuth = slot.requerAutorizacao && !slot.autorizadoPorId;
        const isAuthorized = slot.autorizadoPorId;
        const autorizador = isAuthorized ? users.find(u => u.id === slot.autorizadoPorId) : null;
        return `
        <div class="slot-details">
          <div class="slot-assignee">
            <div>
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Voluntário confirmado:</span>
              <span class="assignee-name">${apontee?.nome || 'Desconhecido'}</span>
              <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">${monthlyCount} apoio(s) neste mês</span>
            </div>
            <span class="assignee-count" style="font-weight: bold; color: var(--info);">
              ${calculateUserPointsGeral(slot.usuarioId).toFixed(2)} pts gerais
            </span>
          </div>
          ${needsAuth ? `
            <div style="margin-top: 8px; padding: 8px 12px; background: var(--warning-glow); border: 1px solid hsla(38, 92%, 50%, 0.3); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--warning);">
              ⚠️ <strong>${monthlyCount}º apoio no mês</strong> — Aguardando autorização gerencial (limite: 3 apoios/mês sem autorização).
            </div>
          ` : ''}
          ${isAuthorized ? `
            <div style="margin-top: 8px; padding: 8px 12px; background: var(--success-glow); border: 1px solid hsla(142, 72%, 45%, 0.3); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--success);">
              ✅ Autorizado por <strong>${autorizador ? autorizador.nome : slot.autorizadoPorId}</strong>
            </div>
          ` : ''}
        </div>
      `; })() : ''}

      <!-- Ações do Slot -->
      <div class="slot-actions" data-slot-id="${slot.id}">
        <!-- Preenchido via listeners -->
      </div>
    </div>
  `;
}

function renderSlots() {
  let filtered = [...slots];
  
  // Filtrar por data conforme a aba ativa
  if (escalaDateFilter === 'future') {
    filtered = filtered.filter(s => s.data >= simulatedCurrentDate);
    filtered.sort((a, b) => new Date(a.data) - new Date(b.data));
  } else if (escalaDateFilter === 'past') {
    filtered = filtered.filter(s => s.data < simulatedCurrentDate);
    filtered.sort((a, b) => new Date(b.data) - new Date(a.data)); // mais recente primeiro para as passadas
  }

  if (activeTab !== 'all') {
    filtered = filtered.filter(s => s.grupoId === activeTab);
  }

  const operatorFilterBar = document.getElementById('operator-filter-bar');
  if (operatorFilterBar) {
    operatorFilterBar.style.display = (currentUser && isCurrentUserOperador()) ? 'flex' : 'none';
  }

  const filterMyAreasCheck = document.getElementById('filter-my-areas');
  if (filterMyAreasCheck && filterMyAreasCheck.checked && currentUser && isCurrentUserOperador()) {
    const userAreas = currentUser.areasFuncoes || [];
    filtered = filtered.filter(s => {
      return !s.areasFuncoes || s.areasFuncoes.length === 0 || s.areasFuncoes.some(area => userAreas.includes(area));
    });
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
    html += getSlotCardHtml(slot);
  });

  slotsGrid.innerHTML = html;
  attachSlotActionsListeners(filtered);
}

function attachSlotActionsListeners(filteredSlots, container = slotsGrid) {
  filteredSlots.forEach(slot => {
    if (!container) return;
    const actionContainer = container.querySelector(`[data-slot-id="${slot.id}"]`);
    if (!actionContainer) return;

    const isDisputa = false; // Vagas são apenas de acesso Direto
    const candList = [];
    const isGestor = isCurrentUserGestor();
    const isPast = slot.data < simulatedCurrentDate;
    const isAdmin = isCurrentUserAdminOnly();

    let actionHtml = '';

    if (isPast) {
      if (isAdmin) {
        actionHtml = `
          <div class="manager-actions-row" style="margin-top: 8px; display: flex; justify-content: flex-end; gap: 8px; align-items: center; width: 100%;">
            <button class="btn btn-secondary btn-icon-only btn-editar-escala" style="font-size: 0.72rem; padding: 4px 8px; color: var(--info); width: 100%;" title="Editar Escala">
              ✏️ Editar Apoio Concluído
            </button>
          </div>
        `;
      } else {
        actionHtml = '';
      }
    } else {
      // 1. Inscrição em vaga direta (Livre comum)
      if (slot.status === 'LIVRE' && !isDisputa && isCurrentUserOperador()) {
        const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
        if (isExcluido) {
          actionHtml = `<button class="btn btn-secondary btn-assumir" style="width: 100%;">🟢 Assumir Apoio (Função Administrativa)</button>`;
        } else {
          actionHtml = `<button class="btn btn-primary btn-assumir" style="width: 100%;">🟢 Assumir Apoio Rápido</button>`;
        }
      }
      // 2. Fila de Candidatura por Prioridade (Art. 3º)
      else if (isDisputa && isCurrentUserOperador()) {
        const jaInscrito = candList.includes(currentUser.id);
        const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
        
        if (isExcluido) {
          actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed;" disabled>⚠️ GPI/OPMAN não disputam prioridade</button>`;
        } else {
          if (jaInscrito) {
            actionHtml = `
              <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
                <span style="font-size: 0.85rem; color: var(--success); font-weight: bold; text-align: center;">✓ Você está na fila</span>
                <button class="btn btn-danger btn-candidatar-sair" style="width: 100%;">❌ Sair da Fila</button>
              </div>
            `;
          } else {
            actionHtml = `
              <button class="btn btn-secondary btn-candidatar" style="width: 100%; border-color: var(--warning); color: var(--warning);">
                ⏳ Candidatar-se à Vaga
              </button>
            `;
          }
        }
      }
      // 3. Substituição/Deslocamento de voluntário por prioridade (bumping)
      else if (slot.status === 'ATRIBUIDO' && !isDisputa && isCurrentUserOperador()) {
        const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
        if (slot.usuarioId === currentUser.id) {
          if (slot.data === simulatedCurrentDate) {
            actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed; border-color: var(--warning); color: var(--warning);" disabled>🔒 Desistência Indisponível no Dia</button>`;
          } else if (slot.autotrocaPayback) {
            actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed; border-color: var(--warning); color: var(--warning);" disabled>🔒 Bloqueado por Quitação de Autotroca</button>`;
          } else {
            actionHtml = `<button class="btn btn-danger btn-desistir-vaga" style="width: 100%;">❌ Desistir do Apoio (Liberar Vaga)</button>`;
          }
        } else if (!isExcluido) {
          const occupant = users.find(u => u.id === slot.usuarioId);
          const occupantIsExcluido = occupant && (occupant.cargo === 'GPI' || occupant.cargo === 'OPMAN');
          const hasPriority = occupantIsExcluido || hasHigherPriority(currentUser.id, slot.usuarioId, slot.id);
          
          if (isLessThan24HoursBefore(slot)) {
            actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed;" disabled>🔒 Ocupado (Substituição Indisponível - Menos de 24h)</button>`;
          } else if (hasPriority && currentConfig.bumpingEnabled) {
            actionHtml = `<button class="btn btn-primary btn-substituir" style="width: 100%;">🔄 Substituir (Maior Prioridade)</button>`;
          } else if (slot.autotrocaPayback) {
            actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed;" disabled>🔒 Vaga Reservada (Quitação de Débito)</button>`;
          } else {
            actionHtml = `<button class="btn btn-secondary" style="width: 100%; cursor: not-allowed;" disabled>🔒 Ocupado (Maior Prioridade)</button>`;
          }
        }
      }

      // 4. Botões de Autorização Gerencial (limite de 3 apoios/mês)
      if (slot.requerAutorizacao && !slot.autorizadoPorId && isGestor) {
        actionHtml += `
          <div class="manager-actions-row" style="margin-top: 8px; display: flex; gap: 8px;">
            <button class="btn btn-primary btn-autorizar-apoio" style="flex: 1; background: var(--success); border: none;">
              ✅ Autorizar Apoio
            </button>
            <button class="btn btn-danger btn-rejeitar-autorizacao" style="flex: 1;">
              ❌ Rejeitar
            </button>
          </div>
        `;
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
        if (isCurrentUserGestor()) {
          actionHtml += `
            <div class="manager-actions-row" style="margin-top: 8px; display: flex; justify-content: flex-end; gap: 8px; align-items: center;">
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
    }

    actionContainer.innerHTML = actionHtml;

    // Conectar eventos
    const btnAssumir = actionContainer.querySelector('.btn-assumir');
    if (btnAssumir) btnAssumir.addEventListener('click', () => handleAssumirVagaDireta(slot.id));

    const btnCandidatar = actionContainer.querySelector('.btn-candidatar');
    if (btnCandidatar) btnCandidatar.addEventListener('click', () => handleCandidatarDisputa(slot.id));

    const btnCandidatarSair = actionContainer.querySelector('.btn-candidatar-sair');
    if (btnCandidatarSair) btnCandidatarSair.addEventListener('click', () => handleSairDisputa(slot.id));

    const btnSubstituir = actionContainer.querySelector('.btn-substituir');
    if (btnSubstituir) btnSubstituir.addEventListener('click', () => handleSubstituirVaga(slot.id));

    const btnDesistir = actionContainer.querySelector('.btn-desistir-vaga');
    if (btnDesistir) btnDesistir.addEventListener('click', () => handleDesistirVaga(slot.id));

    const btnResolver = actionContainer.querySelector('.btn-resolver-disputa');
    if (btnResolver) btnResolver.addEventListener('click', () => handleEncerrarDisputa(slot.id));

    const btnEditarEscala = actionContainer.querySelector('.btn-editar-escala');
    if (btnEditarEscala) btnEditarEscala.addEventListener('click', () => handleIniciarEdicaoEscala(slot.id));

    const btnCancelEscala = actionContainer.querySelector('.btn-cancelar-escala');
    if (btnCancelEscala) btnCancelEscala.addEventListener('click', () => handleCancelarVagaAdmin(slot.id));

    const btnAutorizar = actionContainer.querySelector('.btn-autorizar-apoio');
    if (btnAutorizar) btnAutorizar.addEventListener('click', () => handleAutorizarApoio(slot.id));

    const btnRejeitar = actionContainer.querySelector('.btn-rejeitar-autorizacao');
    if (btnRejeitar) btnRejeitar.addEventListener('click', () => handleRejeitarAutorizacao(slot.id));
  });
}

function renderMyPanel() {
  if (currentUser && isCurrentUserOperador()) {
    myPanelWidget.style.display = 'block';
    
    const score = calculateUserPointsGeral(currentUser.id);
    const lastDate = getUserLastSupportDate(currentUser.id);
    const isExcluido = currentUser.cargo === 'GPI' || currentUser.cargo === 'OPMAN';
    const currentMonth = getTodayStr();
    const monthlyHours = getUserMonthlySupportHours(currentUser.id, currentMonth);
    const rawMonth = new Date(currentMonth + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long' });
    const monthName = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

    const userHistory = history.filter(h => h.usuarioId === currentUser.id);
    const totalHorasAno = userHistory.reduce((acc, h) => acc + (h.totalHoras || 0), 0);

    const groupMap = {
      'grupo_a': 'Grupo A',
      'grupo_b': 'Grupo B',
      'grupo_c': 'Grupo C',
      'grupo_d': 'Grupo D',
      'grupo_e': 'Grupo E',
      'adm': 'ADM'
    };
    const shiftCode = getGroupShiftForDate(currentUser.grupoTrabalho, currentMonth);
    const shiftLabels = {
      '07': '☀️ Turno Diurno',
      '19': '🌙 Turno Noturno',
      'F': '🌴 Folga',
      'ADM': '💼 ADM Comercial'
    };
    const shiftText = shiftLabels[shiftCode] || 'Não Definido';

    const panelContentHtml = `
      <h3 class="widget-title">👤 Meu Painel</h3>
      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem;">
        <div>
          <span style="color: var(--text-muted); display: block;">Nome / Cargo:</span>
          <strong>${currentUser.nome} (${currentUser.cargo})</strong>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          <div>
            <span style="color: var(--text-muted); display: block;">Pontuação Geral:</span>
            <strong style="font-size: 1.15rem; color: ${isExcluido ? 'var(--text-muted)' : 'var(--info)'}">
              ${isExcluido ? 'Sem Classif.' : score.toFixed(4) + ' pts'}
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Horas no Ano:</span>
            <strong style="font-size: 1.15rem; color: var(--success)">
              ${totalHorasAno}h
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Último Apoio:</span>
            <strong style="font-size: 0.85rem; color: var(--text-primary)">
              ${lastDate ? formatDatePt(lastDate) : 'Nenhum'}
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Horas em ${monthName}:</span>
            <strong style="font-size: 1.15rem; color: ${monthlyHours >= currentConfig.monthlyHoursLimit ? 'var(--warning)' : 'var(--success)'}">
              ${monthlyHours}h/${currentConfig.monthlyHoursLimit}h
            </strong>
            ${monthlyHours >= currentConfig.monthlyHoursLimit ? '<span style="font-size: 0.65rem; color: var(--warning); display: block;">Requer autorização</span>' : ''}
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <span style="color: var(--text-muted); display: block;">🔄 Saldo de Folgas (Crédito):</span>
            <strong style="font-size: 1rem; color: var(--success)">
              ${autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'NORMAL' && at.status === 'APROVADA').length} <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: normal;">liberadas</span>
              ${autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'NORMAL' && at.status === 'PENDENTE_APROVACAO').length > 0 ? `<br><span style="font-size: 0.7rem; color: var(--info); font-weight: normal;">(+${autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'NORMAL' && at.status === 'PENDENTE_APROVACAO').length} aguardando aprovação)</span>` : ''}
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">⚠️ Débitos de Apoio:</span>
            <strong style="font-size: 1rem; color: ${autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE').length > 0 ? 'var(--warning)' : 'var(--text-secondary)'}">
              ${autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE').length > 0 ? `${autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE').length} pendente(s)` : 'Nenhum'}
            </strong>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <span style="color: var(--text-muted); display: block;">Escala / Grupo:</span>
            <strong style="text-transform: uppercase;">
              ${groupMap[currentUser.grupoTrabalho] || 'ADM'}
            </strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">Escala de Hoje:</span>
            <strong style="color: ${shiftCode === 'F' ? 'var(--success)' : 'var(--warning)'}">
              ${shiftText}
            </strong>
          </div>
        </div>

        <div>
          <span style="color: var(--text-muted); display: block;">Minhas Áreas de Atuação:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
            ${(currentUser.areasFuncoes || []).map(area => `<span class="badge" style="font-size: 0.65rem; padding: 2px 6px; background: hsla(200, 100%, 30%, 0.15); border: 1px solid hsla(200, 100%, 40%, 0.25); text-transform: uppercase; color: hsl(200, 100%, 80%);">${area}</span>`).join('') || '<span style="font-style: italic; color: var(--text-muted); font-size: 0.8rem;">Nenhuma área configurada</span>'}
          </div>
        </div>

        <div style="margin-top: 5px;">
          <button class="btn btn-secondary btn-edit-my-areas-btn" style="width: 100%; font-size: 0.8rem; padding: 6px 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            ⚙️ Editar Minhas Áreas/Funções
          </button>
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

    myPanelWidget.innerHTML = panelContentHtml;

    const mobilePanelContainer = document.getElementById('mobile-my-panel-container');
    if (mobilePanelContainer) {
      mobilePanelContainer.innerHTML = panelContentHtml;
    }

    document.querySelectorAll('.btn-edit-my-areas-btn').forEach(btn => {
      btn.addEventListener('click', openOperatorAreasModal);
    });
  } else {
    myPanelWidget.style.display = 'none';
  }
}

function renderCalendarView() {
  if (!viewCalendario || viewCalendario.style.display === 'none') return;

  // Inicializa o grupo de trabalho do calendário caso não esteja definido ou não seja válido/visível
  const visibleGroups = groups.filter(g => g.visibleInCalendar !== false);
  const isSelectedGroupValid = visibleGroups.some(g => g.id === calendarSelectedGroupId) || (calendarSelectedGroupId === 'adm' && groups.find(g => g.id === 'adm')?.visibleInCalendar !== false);
  if (!calendarSelectedGroupId || !isSelectedGroupValid) {
    calendarSelectedGroupId = (currentUser && currentUser.grupoTrabalho && (visibleGroups.some(g => g.id === currentUser.grupoTrabalho) || (currentUser.grupoTrabalho === 'adm' && groups.find(g => g.id === 'adm')?.visibleInCalendar !== false))) 
      ? currentUser.grupoTrabalho 
      : (visibleGroups[0] ? visibleGroups[0].id : 'grupo_a');
  }

  const currentDateObj = new Date(simulatedCurrentDate + 'T00:00:00');
  
  // Aplica o deslocamento de meses selecionado pelo usuário
  currentDateObj.setMonth(currentDateObj.getMonth() + calendarStartMonthOffset);
  
  const year1 = currentDateObj.getFullYear();
  const month1 = currentDateObj.getMonth();

  // Renderizar seletor de grupos no rodapé dinamicamente
  const visibleGroupsForSelector = groups.filter(g => g.visibleInCalendar !== false);
  const groupsList = visibleGroupsForSelector.map(g => {
    let label = g.nome;
    if (g.nome.toLowerCase().startsWith('grupo ')) {
      label = g.nome.substring(6).trim().toUpperCase();
    } else if (g.nome.length > 5) {
      label = g.nome.substring(0, 4) + '.';
    }
    return { id: g.id, label: label };
  });
  if (!groupsList.some(g => g.id === 'adm') && groups.find(g => g.id === 'adm')?.visibleInCalendar !== false) {
    groupsList.push({ id: 'adm', label: 'ADM' });
  }

  let selectorHtml = '';
  groupsList.forEach(g => {
    const activeClass = calendarSelectedGroupId === g.id ? 'active' : '';
    selectorHtml += `
      <button class="group-circle-btn ${activeClass}" data-group="${g.id}">
        ${g.label}
      </button>
    `;
  });
  calendarGroupSelector.innerHTML = selectorHtml;

  // Ligar eventos nos botões circulares
  calendarGroupSelector.querySelectorAll('.group-circle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      calendarSelectedGroupId = btn.getAttribute('data-group');
      renderCalendarView();
    });
  });

  // Renderizar meses
  let monthsHtml = '';
  monthsHtml += renderSingleCalendarMonth(year1, month1);
  calendarMonthsContainer.innerHTML = monthsHtml;

  // Ligar eventos nos dias com apoios
  calendarMonthsContainer.querySelectorAll('.calendar-day-cell.has-apoios').forEach(cell => {
    cell.addEventListener('click', () => {
      const dateStr = cell.getAttribute('data-date');
      openCalendarDayDetails(dateStr);
    });
  });

  // Atualizar modal de detalhes se estiver aberto
  if (calendarSelectedDateDetails && calendarDetailsModal.style.display === 'flex') {
    openCalendarDayDetails(calendarSelectedDateDetails);
  }
}

function renderSingleCalendarMonth(year, month) {
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const monthTitle = `${monthNames[month]} ${year}`;

  // Cabeçalho dos dias
  const daysHeader = `
    <div class="calendar-day-header">Seg</div>
    <div class="calendar-day-header">Ter</div>
    <div class="calendar-day-header">Qua</div>
    <div class="calendar-day-header">Qui</div>
    <div class="calendar-day-header">Sex</div>
    <div class="calendar-day-header">Sáb</div>
    <div class="calendar-day-header">Dom</div>
  `;

  // Calcular dia da semana inicial (Segunda = 0, ..., Domingo = 6)
  const firstDay = new Date(year, month, 1);
  let firstDayIndex = firstDay.getDay() - 1;
  if (firstDayIndex < 0) firstDayIndex = 6; // Domingo vira 6

  // Obter número de dias no mês
  const totalDays = new Date(year, month + 1, 0).getDate();

  let gridHtml = daysHeader;

  // Preencher células vazias do início do mês
  for (let i = 0; i < firstDayIndex; i++) {
    gridHtml += '<div class="calendar-day-empty"></div>';
  }

  // Preencher dias do mês
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayStr = String(dayNum).padStart(2, '0');
    const monthStr = String(month + 1).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const shiftCode = getGroupShiftForDate(calendarSelectedGroupId, dateStr);

    let shiftText = '';
    let shiftClass = '';

    if (shiftCode === '07') {
      shiftText = '07-19';
      shiftClass = 'shift-diurno';
    } else if (shiftCode === '19') {
      shiftText = '19-07';
      shiftClass = 'shift-noturno';
    } else if (shiftCode === 'ADM') {
      shiftText = 'ADM';
      shiftClass = 'shift-adm';
    } else {
      shiftText = 'Folga';
      shiftClass = 'shift-folga';
    }

    const todayClass = dateStr === simulatedCurrentDate ? 'calendar-today' : '';

    // Filtrar apoios (vagas) para esta data (removemos histórico da indicação do calendário)
    const daySlots = slots.filter(s => s.data === dateStr);
    const totalSupports = daySlots.length;

    const hasApoiosClass = totalSupports > 0 ? 'has-apoios' : '';
    const dataDateAttr = totalSupports > 0 ? `data-date="${dateStr}"` : '';

    let hoverText = formatDatePt(dateStr);
    const occupiedSlots = daySlots.filter(s => s.status === 'ATRIBUIDO' && s.usuarioId);
    if (occupiedSlots.length > 0) {
      const names = occupiedSlots.map(s => {
        const u = users.find(user => user.id === s.usuarioId);
        return u ? (u.apelido || (u.nome ? u.nome.split(' ')[0] : 'Desconhecido')) : 'Desconhecido';
      });
      hoverText += `\nApoio: ${names.join(', ')}`;
    }

    let indicatorsHtml = '';
    if (totalSupports > 0) {
      const freeSlotsCount = daySlots.filter(s => s.status === 'LIVRE').length;
      const occupiedSlotsCount = daySlots.filter(s => s.status === 'ATRIBUIDO').length;

      indicatorsHtml = '<div class="calendar-day-indicators">';
      if (freeSlotsCount > 0) {
        indicatorsHtml += `<span class="calendar-indicator indicator-free" title="${freeSlotsCount} vaga(s) livre(s)">${freeSlotsCount}v</span>`;
      }
      if (occupiedSlotsCount > 0) {
        indicatorsHtml += `<span class="calendar-indicator indicator-occupied" title="${occupiedSlotsCount} vaga(s) ocupada(s)">${occupiedSlotsCount}o</span>`;
      }
      indicatorsHtml += '</div>';
    }

    gridHtml += `
      <div class="calendar-day-cell ${shiftClass} ${todayClass} ${hasApoiosClass}" ${dataDateAttr} title="${hoverText}">
        <span class="calendar-day-num">${dayNum}</span>
        <span class="calendar-day-shift">${shiftText}</span>
        ${totalSupports > 0 ? indicatorsHtml : ''}
      </div>
    `;
  }

  return `
    <div>
      <div class="calendar-month-title">${monthTitle}</div>
      <div class="calendar-month-grid">
        ${gridHtml}
      </div>
    </div>
  `;
}

function openCalendarDayDetails(dateStr) {
  calendarSelectedDateDetails = dateStr;
  
  // Filtrar vagas e histórico do dia
  const daySlots = slots.filter(s => s.data === dateStr);
  const dayHistory = history.filter(h => h.data === dateStr);

  calendarDetailsTitle.innerHTML = `📅 Apoios do Dia - ${formatDatePt(dateStr)}`;

  let bodyHtml = '';

  // 1. Seção de Vagas Operacionais (Slots)
  bodyHtml += `<h3 style="font-size: 1rem; color: var(--primary); margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); margin-top: 8px;">📋 Escalas de Trabalho (Vagas)</h3>`;
  if (daySlots.length === 0) {
    bodyHtml += `
      <div class="glass-panel" style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 24px;">
        Nenhuma escala cadastrada para esta data.
      </div>
    `;
  } else {
    bodyHtml += `<div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 24px;">`;
    daySlots.forEach(slot => {
      bodyHtml += getSlotCardHtml(slot);
    });
    bodyHtml += `</div>`;
  }

  // 2. Seção de Histórico de Apoios Registrados (Histórico)
  bodyHtml += `<h3 style="font-size: 1rem; color: var(--success); margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color);">✅ Apoios Registrados (Histórico)</h3>`;
  if (dayHistory.length === 0) {
    bodyHtml += `
      <div class="glass-panel" style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        Nenhum registro de apoio executado nesta data.
      </div>
    `;
  } else {
    bodyHtml += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    dayHistory.forEach(h => {
      const user = users.find(u => u.id === h.usuarioId);
      const regBy = users.find(u => u.id === h.registradoPorId);
      const group = groups.find(g => g.id === h.grupoId);
      const groupName = group ? group.nome : '';

      bodyHtml += `
        <div class="glass-panel" style="padding: 12px; border-left: 4px solid var(--success); display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <strong style="font-size: 0.9rem; color: var(--text-primary);">${user?.nome || 'Desconhecido'}</strong>
              ${groupName ? `<span style="font-size: 0.7rem; font-weight: bold; text-transform: uppercase; color: var(--info); display: block; margin-top: 2px;">Grupo ${groupName}</span>` : ''}
            </div>
            <span style="font-weight: bold; color: var(--info); font-size: 0.95rem;">${h.pontuacao.toFixed(2)} pts</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div>
              <strong>Atividade:</strong> ${h.subgrupo}
            </div>
            ${h.totalHoras ? `
              <div style="font-size: 0.72rem; color: var(--success); font-weight: bold; background: hsla(142, 70%, 45%, 0.1); padding: 2px 6px; border-radius: 4px;" title="Horário: ${h.horaInicio || '07:00'} às ${h.horaTermino || '19:00'}">
                ⏱️ ${h.horaInicio || '07:00'}-${h.horaTermino || '19:00'} (${h.totalHoras}h)
              </div>
            ` : ''}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: var(--text-muted); flex-wrap: wrap; gap: 6px; margin-top: 4px;">
            <div style="display: flex; gap: 4px;">
              ${h.regras.map(rid => {
                const rule = supportRules.find(r => r.id === rid);
                const color = rid === 'R13' ? 'var(--danger)' : 'var(--primary)';
                return `<code style="font-size: 0.65rem; padding: 1px 4px; border-radius: 4px; background: rgba(255,255,255,0.05); color: ${color};" title="${rule?.descricao || rid}">${rid}</code>`;
              }).join('')}
            </div>
            <span>Registrado por ${regBy?.nome || 'Sistema'}</span>
          </div>
        </div>
      `;
    });
    bodyHtml += `</div>`;
  }

  calendarDetailsBody.innerHTML = bodyHtml;
  calendarDetailsModal.style.display = 'flex';

  // Ligar listeners de eventos para as vagas no modal
  if (daySlots.length > 0) {
    attachSlotActionsListeners(daySlots, calendarDetailsBody);
  }
}


function renderRanking() {
  let html = '';
  
  // Apoiadores válidos para classificação (filtra quem tem score > 0.0 de acordo com o pedido 9)
  const classificados = users
    .filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
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
  const naoClassificados = users.filter(u => u.cargo === 'GPI' || u.cargo === 'OPMAN');
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
  const historyMobileCards = document.getElementById('history-mobile-cards');
  let html = '';
  let mobileHtml = '';

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
    const group = groups.find(g => g.id === h.grupoId);
    const groupName = group ? group.nome : '';
    const displayNickname = user ? (user.apelido || (user.nome ? user.nome.trim().split(' ')[0] : 'Desconhecido')) : 'Desconhecido';
    const regByNickname = regBy ? (regBy.apelido || (regBy.nome ? regBy.nome.trim().split(' ')[0] : 'Sistema')) : 'Sistema';
    
    const canEdit = isCurrentUserGestor() || h.usuarioId === currentUser.id || h.registradoPorId === currentUser.id;
    const canDelete = isCurrentUserAdminOnly();

    const horaInicioStr = h.horaInicio || '07:00';
    const horaTerminoStr = h.horaTermino || '19:00';

    html += `
      <tr>
        <td><strong>${formatDatePt(h.data)}</strong></td>
        <td><strong title="${user?.nome || ''}" style="font-size: 0.9rem; cursor: help;">${displayNickname}</strong></td>
        <td>
          ${groupName ? `<span style="font-size: 0.72rem; font-weight: bold; text-transform: uppercase; color: var(--info); display: block; margin-bottom: 2px;">${groupName}</span>` : ''}
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 0.85rem; font-weight: 500;">${h.subgrupo}</span>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">⏱️ ${horaInicioStr} às ${horaTerminoStr} ${h.totalHoras ? `(${h.totalHoras}h)` : ''}</span>
          </div>
        </td>
        <td>
          ${h.regras.map(rid => {
            const rule = supportRules.find(r => r.id === rid);
            const color = rid === 'R13' ? 'var(--danger)' : 'var(--primary)';
            return `<code style="font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; background: hsla(222, 47%, 20%, 0.5); color: ${color}; margin-right: 4px;" title="${rule?.descricao}">${rid}</code>`;
          }).join('')}
        </td>
        <td>
          <span style="font-size: 0.72rem; color: var(--text-muted);">
            Em: ${formatDatePt(h.dataRegistro.split('T')[0])} por ${regByNickname}
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

    mobileHtml += `
      <div class="glass-panel" style="padding: 16px; display: flex; flex-direction: column; gap: 8px; border-left: 4px solid var(--info); background: var(--bg-card); margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 0.95rem;">${formatDatePt(h.data)}</strong>
          <strong style="color: var(--info); font-size: 1.05rem;">${h.pontuacao.toFixed(4)} pts</strong>
        </div>
        <div style="font-size: 0.85rem; margin-top: 2px;">
          <span style="color: var(--text-muted); font-size: 0.75rem;">Apelido:</span>
          <strong title="${user?.nome || ''}">${displayNickname}</strong>
        </div>
        <div style="font-size: 0.85rem; display: flex; flex-direction: column; gap: 2px;">
          <div>
            <span style="color: var(--text-muted); font-size: 0.75rem;">Área/Função:</span>
            <strong>${groupName ? groupName + ' - ' : ''}${h.subgrupo}</strong>
            ${h.areaFuncao ? `<span class="badge" style="font-size: 0.65rem; padding: 2px 6px; background: hsla(190, 90%, 50%, 0.15); border: 1px solid var(--info); color: var(--info); font-weight: 600; text-transform: uppercase; display: inline-block; margin-left: 4px;">📍 ${h.areaFuncao}</span>` : ''}
          </div>
          <span style="font-size: 0.75rem; color: var(--success); font-weight: bold;">⏱️ ${horaInicioStr} às ${horaTerminoStr} (${h.totalHoras || 12}h)</span>
        </div>
        <div style="margin-top: 4px;">
          <span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 4px;">Regras Aplicadas:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${h.regras.map(rid => {
              const rule = supportRules.find(r => r.id === rid);
              const color = rid === 'R13' ? 'var(--danger)' : 'var(--primary)';
              return `<code style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: hsla(222, 47%, 20%, 0.5); color: ${color};" title="${rule?.descricao}">${rid}</code>`;
            }).join('')}
          </div>
        </div>
        <div style="border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; flex-wrap: wrap; gap: 8px;">
          <span style="color: var(--text-muted);">
            Por: ${regByNickname} em ${formatDatePt(h.dataRegistro.split('T')[0])}
          </span>
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            ${canEdit ? `
              <button class="btn btn-secondary btn-editar-historico" data-id="${h.id}" title="Editar" style="color: var(--info); padding: 4px 8px; font-size: 0.75rem; line-height: 1;">✏️ Editar</button>
            ` : ''}
            ${canDelete ? `
              <button class="btn btn-secondary btn-excluir-historico" data-id="${h.id}" title="Excluir" style="color: var(--danger); padding: 4px 8px; font-size: 0.75rem; line-height: 1;">✕ Excluir</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });

  if (filteredHistory.length === 0) {
    html = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum apoio registrado para a seleção no histórico de 2026.</td></tr>`;
    mobileHtml = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum apoio registrado para a seleção no histórico de 2026.</div>`;
  }

  historyTableBody.innerHTML = html;
  if (historyMobileCards) {
    historyMobileCards.innerHTML = mobileHtml;
  }

  viewHistorico.querySelectorAll('.btn-editar-historico').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.getAttribute('data-id');
      handleIniciarEdicaoHistorico(hid);
    });
  });

  viewHistorico.querySelectorAll('.btn-excluir-historico').forEach(btn => {
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

  const isOnlyAdmin = isCurrentUserAdminOnly();

  // Mostrar ou esconder botão de cadastrar novo usuário com base no perfil de Admin
  const btnCreate = document.getElementById('btn-open-user-modal');
  if (btnCreate) {
    if (isOnlyAdmin) {
      btnCreate.style.display = 'inline-flex';
    } else {
      btnCreate.style.display = 'none';
    }
  }

  const groupMap = {
    'grupo_a': 'Grupo A',
    'grupo_b': 'Grupo B',
    'grupo_c': 'Grupo C',
    'grupo_d': 'Grupo D',
    'grupo_e': 'Grupo E',
    'adm': 'ADM'
  };

  filteredUsers.forEach(u => {
    const score = calculateUserPointsGeral(u.id);
    const hasHistory = history.some(h => h.usuarioId === u.id);
    const scoreText = (u.cargo === 'GPI' || u.cargo === 'OPMAN') ? 'Isento' : `${score.toFixed(4)} pts`;
    const groupName = groupMap[u.grupoTrabalho] || 'ADM';

    html += `
      <tr>
        <td><strong style="color: var(--primary);">${u.id.toUpperCase()}</strong></td>
        <td>
          <span style="font-weight: 600;">${u.nome}</span>
          ${u.apelido ? `<br><small style="color: var(--text-muted); font-size: 0.72rem;">Apelido: ${u.apelido}</small>` : ''}
        </td>
        <td>
          <div>${u.cargo}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; max-width: 250px;">
            ${(u.areasFuncoes || []).map(area => `<span class="badge" style="font-size: 0.6rem; padding: 1px 4px; background: hsla(200, 100%, 30%, 0.15); border: 1px solid hsla(200, 100%, 40%, 0.25); text-transform: uppercase; color: hsl(200, 100%, 80%);">${area}</span>`).join('') || '<span style="font-size: 0.65rem; color: var(--text-muted); font-style: italic;">Nenhuma área</span>'}
          </div>
        </td>
        <td>
          <span class="badge ${
            u.tipo === 'ADMINISTRADOR' ? 'badge-cancelled' : 
            u.tipo === 'GERENTE' ? 'badge-pending' : 
            u.tipo === 'SUPERVISOR' ? 'badge-assigned' : 'badge-open'
          }">
            ${u.tipo}
          </span>
        </td>
        <td>
          <span class="badge" style="background: hsla(280, 100%, 30%, 0.12); border: 1px solid hsla(280, 100%, 40%, 0.22); color: hsl(280, 100%, 85%); text-transform: uppercase;">
            ${groupName}
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
    html = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum usuário correspondente à pesquisa.</td></tr>`;
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

  let userAreas = [];
  if (mode === 'add') {
    userModalTitle.textContent = 'Cadastrar Novo Colaborador';
    userFormChave.disabled = false;
    userFormOldChave.value = '';
    if (userFormApelido) userFormApelido.value = '';
    userFormNivel.value = 'OPERADOR';
    userFormCargo.value = 'Operador';
    userFormGrupoTrabalho.value = 'grupo_a';
  } else if (mode === 'edit') {
    userModalTitle.textContent = 'Editar Colaborador';
    const user = users.find(u => u.id === id);
    if (user) {
      userFormChave.value = user.id.toUpperCase();
      userFormChave.disabled = true; // Chave não se edita
      userFormOldChave.value = user.id;
      userFormNome.value = user.nome;
      if (userFormApelido) userFormApelido.value = user.apelido || '';
      userFormEmail.value = user.email || '';
      userFormCargo.value = user.cargo;
      userFormNivel.value = user.tipo;
      userFormGrupoTrabalho.value = user.grupoTrabalho || 'adm';
      userAreas = user.areasFuncoes || [];
    }
  }

  document.querySelectorAll('input[name="user-areas-funcoes"]').forEach(cb => {
    cb.checked = userAreas.includes(cb.value);
  });

  userModal.style.display = 'flex';
}

function handleSaveUser(e) {
  e.preventDefault();

  if (!isCurrentUserAdminOnly()) {
    showBanner('Apenas administradores podem cadastrar ou editar usuários.', 'danger');
    return;
  }

  const mode = userFormMode.value;
  const oldChave = userFormOldChave.value;
  const newChave = userFormChave.value.trim().toUpperCase(); // Normaliza chaves em caixa alta
  const nome = userFormNome.value.trim();
  const apelido = userFormApelido ? userFormApelido.value.trim() : '';
  const email = userFormEmail.value.trim().toLowerCase();
  const cargo = userFormCargo.value.trim();
  const nivel = userFormNivel.value;
  const grupoTrabalho = userFormGrupoTrabalho.value;

  if (!newChave || !nome || !email) {
    showBanner('Preencha os campos obrigatórios.', 'danger');
    return;
  }

  const checkedAreasCbs = document.querySelectorAll('input[name="user-areas-funcoes"]:checked');
  const areasFuncoes = Array.from(checkedAreasCbs).map(cb => cb.value);

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
      apelido: apelido || nome.split(' ')[0],
      email: email,
      tipo: nivel,
      cargo: cargo,
      infracoesWA: 0,
      areasFuncoes: areasFuncoes,
      grupoTrabalho: grupoTrabalho
    };

    users = [...users, novoUser];
    showBanner(`Colaborador ${nome} cadastrado com sucesso!`, 'success');
  } else {
    // Edit mode
    users = users.map(u => {
      if (u.id === oldChave) {
        const isAdmin = oldChave.toUpperCase() === 'AB3R' || u.email.toLowerCase() === 'adailton.medeiros@gmail.com';
        return {
          ...u,
          nome: nome,
          apelido: apelido || u.apelido || nome.split(' ')[0],
          email: isAdmin ? 'adailton.medeiros@gmail.com' : email,
          cargo: cargo,
          tipo: isAdmin ? 'ADMINISTRADOR' : nivel,
          areasFuncoes: areasFuncoes,
          grupoTrabalho: grupoTrabalho
        };
      }
      return u;
    });

    showBanner(`Dados de ${nome} atualizados com sucesso!`, 'success');
  }

  userModal.style.display = 'none';
  persistChanges('users');
  renderUsersTable();
}

function handleDeleteUser(chave) {
  if (!isCurrentUserAdminOnly()) {
    showBanner('Apenas administradores podem excluir usuários.', 'danger');
    return;
  }

  // Proteção do Administrador Principal
  const targetUser = users.find(u => u.id === chave);
  if (chave.toUpperCase() === 'AB3R' || (targetUser && targetUser.email.toLowerCase() === 'adailton.medeiros@gmail.com')) {
    showBanner('Não é permitido excluir o administrador principal do sistema.', 'danger');
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
    persistChanges('users');
    renderUsersTable();
  }
}

function openOperatorAreasModal() {
  if (!currentUser) return;
  const userAreas = currentUser.areasFuncoes || [];
  
  document.querySelectorAll('input[name="operator-areas-funcoes"]').forEach(cb => {
    cb.checked = userAreas.includes(cb.value);
  });
  
  const operatorFormGrupoTrabalho = document.getElementById('operator-form-grupo-trabalho');
  if (operatorFormGrupoTrabalho) {
    operatorFormGrupoTrabalho.value = currentUser.grupoTrabalho || 'adm';
  }
  
  if (operatorFormApelido) {
    operatorFormApelido.value = currentUser.apelido || (currentUser.nome ? currentUser.nome.trim().split(' ')[0] : '');
  }
  
  operatorAreasModal.style.display = 'flex';
}

function handleSaveOperatorAreas(e) {
  e.preventDefault();
  
  if (!currentUser) return;
  
  const checkedAreasCbs = document.querySelectorAll('input[name="operator-areas-funcoes"]:checked');
  const areasFuncoes = Array.from(checkedAreasCbs).map(cb => cb.value);
  
  const operatorFormGrupoTrabalho = document.getElementById('operator-form-grupo-trabalho');
  const grupoTrabalho = operatorFormGrupoTrabalho ? operatorFormGrupoTrabalho.value : currentUser.grupoTrabalho;
  
  const apelido = operatorFormApelido ? operatorFormApelido.value.trim() : '';
  
  users = users.map(u => {
    if (u.id === currentUser.id) {
      const updated = { 
        ...u, 
        areasFuncoes: areasFuncoes, 
        grupoTrabalho: grupoTrabalho,
        apelido: apelido || u.apelido || u.nome.trim().split(' ')[0]
      };
      currentUser = updated; // Atualizar usuário ativo
      return updated;
    }
    return u;
  });
  
  showBanner('Suas áreas, funções, grupo de trabalho e apelido foram atualizados com sucesso!', 'success');
  
  operatorAreasModal.style.display = 'none';
  persistChanges('users');
  renderAll();
}

function renderFormGroupsOptions() {
  const selectGrupo = document.getElementById('form-grupo');
  let html = '';
  groups.forEach(g => {
    html += `<option value="${g.id}">${g.nome}</option>`;
  });
  if (selectGrupo) selectGrupo.innerHTML = html;

  if (regGrupoSelect) {
    regGrupoSelect.innerHTML = html;
  }

  // Povoar seletores de grupo nos formulários de usuário e operador
  const selectUserGrupo = document.getElementById('user-form-grupo-trabalho');
  if (selectUserGrupo) {
    let userGrupoHtml = '';
    groups.forEach(g => {
      let cycleDesc = '';
      if (g.dataInicio || GROUP_START_DATES[g.id]) {
        cycleDesc = ' (Turno 12h)';
      } else if (g.id === 'adm') {
        cycleDesc = ' (Administrativo - Segunda a Sexta)';
      }
      userGrupoHtml += `<option value="${g.id}">${g.nome}${cycleDesc}</option>`;
    });
    if (!groups.some(g => g.id === 'adm')) {
      userGrupoHtml += `<option value="adm">ADM (Administrativo - Segunda a Sexta)</option>`;
    }
    selectUserGrupo.innerHTML = userGrupoHtml;
  }

  const selectOperatorGrupo = document.getElementById('operator-form-grupo-trabalho');
  if (selectOperatorGrupo) {
    let opGrupoHtml = '';
    groups.forEach(g => {
      let cycleDesc = '';
      if (g.dataInicio || GROUP_START_DATES[g.id]) {
        cycleDesc = ' (Turno 12h)';
      } else if (g.id === 'adm') {
        cycleDesc = ' (Administrativo - Segunda a Sexta)';
      }
      opGrupoHtml += `<option value="${g.id}">${g.nome}${cycleDesc}</option>`;
    });
    if (!groups.some(g => g.id === 'adm')) {
      opGrupoHtml += `<option value="adm">ADM (Administrativo - Segunda a Sexta)</option>`;
    }
    selectOperatorGrupo.innerHTML = opGrupoHtml;
  }

  const selectRegUsuario = document.getElementById('reg-usuario');
  let userHtml = '';
  const sortedRegUsers = [...users]
    .filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .sort((a, b) => a.nome.localeCompare(b.nome));
  sortedRegUsers.forEach(u => {
    userHtml += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });
  if (selectRegUsuario) selectRegUsuario.innerHTML = userHtml;
  
  // Re-ligar listener se mudou
  if (selectRegUsuario) {
    selectRegUsuario.removeEventListener('change', checkLateSubmission);
    selectRegUsuario.addEventListener('change', () => {
      checkLateSubmission();
      updatePointsPreview();
    });
  }

  const selectInfUsuario = document.getElementById('inf-usuario');
  let infHtml = '';
  const sortedInfUsers = [...users]
    .filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .sort((a, b) => a.nome.localeCompare(b.nome));
  sortedInfUsers.forEach(u => {
    infHtml += `<option value="${u.id}">${u.nome} (${u.cargo})</option>`;
  });
  if (selectInfUsuario) selectInfUsuario.innerHTML = infHtml;

  updateFormUsuarioSelectCompatibility();
}

function updateFormSubgrupoFromAreas() {
  const formSubgrupo = document.getElementById('form-subgrupo');
  if (!formSubgrupo) return;
  
  const checkedCbs = document.querySelectorAll('input[name="slot-areas-funcoes"]:checked');
  const selectedAreas = Array.from(checkedCbs).map(cb => cb.value);
  
  if (selectedAreas.length > 0) {
    formSubgrupo.value = selectedAreas.join(' ou ');
  } else {
    formSubgrupo.value = '';
  }
}

function updateFormUsuarioSelectCompatibility() {
  const selectFormUsuario = document.getElementById('form-usuario');
  if (!selectFormUsuario) return;
  
  const selectedUser = selectFormUsuario.value;
  
  const checkedCbs = document.querySelectorAll('input[name="slot-areas-funcoes"]:checked');
  const selectedAreas = Array.from(checkedCbs).map(cb => cb.value);
  
  const inputDate = document.getElementById('form-data');
  const inputHoraInicio = document.getElementById('form-hora-inicio');
  const dateVal = inputDate ? inputDate.value : '';
  const horaInicioVal = inputHoraInicio ? inputHoraInicio.value : '07:00';
  
  // Se o horário começar com 19, 18 ou 20, assume turno noturno "19", senão diurno "07"
  const targetShift = (horaInicioVal.startsWith('19') || horaInicioVal.startsWith('18') || horaInicioVal.startsWith('20')) ? '19' : '07';

  const sortedRegUsers = [...users]
    .filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN')
    .sort((a, b) => a.nome.localeCompare(b.nome));
    
  let formUserHtml = '<option value="">-- Vaga Livre / Sem Operador --</option>';
  sortedRegUsers.forEach(u => {
    const userAreas = u.areasFuncoes || [];
    const isCompatible = selectedAreas.length === 0 || selectedAreas.some(area => userAreas.includes(area));
    
    let label = '';
    if (!isCompatible) {
      label += ' (⚠️ Área Incompatível)';
    }
    
    if (dateVal && targetShift && u.grupoTrabalho) {
      const userShift = getGroupShiftForDate(u.grupoTrabalho, dateVal);
      if (userShift === targetShift) {
        label += ' (⚠️ Em Turno Normal)';
      }
    }
    
    const mesAtualStr = getTodayStr();
    const mensalHours = getUserMonthlySupportHours(u.id, dateVal || mesAtualStr);
    const mesLabel = (dateVal || mesAtualStr).substring(0, 7);
    const [mY, mM] = mesLabel.split('-');
    const mNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const mAbrev = mNomes[parseInt(mM, 10) - 1];
    const countColor = mensalHours >= currentConfig.monthlyHoursLimit ? ' 🔴' : (mensalHours >= currentConfig.monthlyHoursLimit - 12) ? ' 🟡' : '';
    formUserHtml += `<option value="${u.id}">${u.nome} (${u.cargo})${label} [${mensalHours}h/${currentConfig.monthlyHoursLimit}h ${mAbrev}${countColor}]</option>`;
  });
  
  selectFormUsuario.innerHTML = formUserHtml;
  
  // Tenta restaurar valor anterior, caso ainda esteja disponível no novo HTML
  if (sortedRegUsers.some(u => u.id === selectedUser)) {
    selectFormUsuario.value = selectedUser;
  } else {
    selectFormUsuario.value = "";
  }
}

function renderRulesCheckboxes() {
  let html = '';
  supportRules.filter(r => r.id !== 'R13').forEach(r => {
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

  let modalHtml = `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #fff; cursor: pointer;">
      <input type="radio" name="modal-regime-base" value="R1" checked style="width: auto;">
      <span><strong>R1 - Turno</strong> (12h - Peso 1.0)</span>
    </label>
    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #fff; cursor: pointer;">
      <input type="radio" name="modal-regime-base" value="R2" style="width: auto;">
      <span><strong>R2 - ADM</strong> (8h - Peso 0.7)</span>
    </label>
  `;
  if (modalRulesCheckboxes) {
    modalRulesCheckboxes.innerHTML = modalHtml;
  }

  rulesCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updatePointsPreview);
  });
}

// --- LÓGICA DE PRÉ-VISUALIZAÇÃO DE CÁLCULO ---

function updatePointsPreview() {
  // Calcular e exibir a pré-visualização de horas geradas
  if (regHoraInicioInput && regHoraTerminoInput && regHorasPreview) {
    const hours = calculateSupportHours(regHoraInicioInput.value, regHoraTerminoInput.value);
    regHorasPreview.textContent = `${hours}h`;
  }

  const selectedCbs = rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]:checked');
  const regras = Array.from(selectedCbs).map(cb => cb.value);

  const isLate = isSubmissionLate();
  const isBypassed = regBypassLimit && regBypassLimit.checked;
  const applyPenalty = isLate && !isBypassed && currentConfig.penaltiesEnabled;
  
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
      const rule = supportRules.find(r => r.id === rid);
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
  const limitMs = currentConfig.lateSubmissionHours * 60 * 60 * 1000;
  
  return diffTime > limitMs;
}

function checkLateSubmission() {
  const isLate = isSubmissionLate();
  const isBypassed = regBypassLimit && regBypassLimit.checked;
  
  if (isLate && currentConfig.penaltiesEnabled) {
    regDateWarning.style.display = 'block';
    if (isBypassed) {
      regDateWarning.textContent = `ℹ️ Lançamento fora do prazo de ${currentConfig.lateSubmissionHours}h, mas a penalidade R13 foi ignorada por ajuste administrativo.`;
      regDateWarning.style.color = 'var(--warning)';
    } else {
      regDateWarning.textContent = `⚠️ Lançamento fora do prazo de ${currentConfig.lateSubmissionHours} horas! Será aplicada a penalidade R13 automaticamente.`;
      regDateWarning.style.color = 'var(--danger)';
    }
  } else {
    regDateWarning.style.display = 'none';
  }
  updatePointsPreview();
}

// --- EVENT HANDLERS ---

let currentModalSelectedArea = null;

function openConfirmAssumeModal(slotId, isSub) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  currentModalSlotId = slotId;
  currentModalIsSub = isSub;
  currentModalSelectedArea = null;

  const confirmModalText = document.getElementById('confirm-modal-text');
  const normalContainer = document.getElementById('confirm-normal-btn-container');
  const autotrocaWrapper = document.getElementById('confirm-autotroca-wrapper');
  const paybackContainer = document.getElementById('confirm-payback-btn-container');

  // Regime Base definido pelo supervisor
  const regimeBase = (slot.regrasPrevistas && slot.regrasPrevistas.includes('R2')) ? 'R2' : 'R1';

  const regimeBadge = document.getElementById('confirm-regime-base-badge');
  if (regimeBadge) {
    regimeBadge.innerHTML = regimeBase === 'R2'
      ? `📋 <strong style="color: var(--text-primary);">Regime definido pelo supervisor:</strong> <span style="font-weight: 600; color: var(--info);">R2 - ADM (Carga 8h - Peso 0.7)</span>`
      : `🔵 <strong style="color: var(--text-primary);">Regime definido pelo supervisor:</strong> <span style="font-weight: 600; color: var(--info);">R1 - TURNO (Carga 12h - Peso 1.0)</span>`;
  }

  // Configurar Seleção de Área/Função Assumida
  const areaContainer = document.getElementById('confirm-area-assumida-container');
  const areaGrid = document.getElementById('confirm-area-buttons-grid');
  const slotAreas = slot.areasFuncoes || [];

  if (areaContainer && areaGrid) {
    if (slotAreas.length === 0) {
      areaContainer.style.display = 'none';
      currentModalSelectedArea = '';
    } else {
      areaContainer.style.display = 'block';
      const userAreas = currentUser ? (currentUser.areasFuncoes || []) : [];
      
      // Auto-seleção: se houver 1 área ou se já havia áreaAssumida, ou 1ª área compatível
      if (slotAreas.length === 1) {
        currentModalSelectedArea = slotAreas[0];
      } else if (slot.areaAssumida && slotAreas.includes(slot.areaAssumida)) {
        currentModalSelectedArea = slot.areaAssumida;
      } else {
        const firstCompatible = slotAreas.find(a => userAreas.includes(a));
        currentModalSelectedArea = firstCompatible || slotAreas[0];
      }

      let areaHtml = '';
      slotAreas.forEach(area => {
        const isSelected = area === currentModalSelectedArea;
        const isCompatible = userAreas.length === 0 || userAreas.includes(area);
        areaHtml += `
          <button type="button" class="area-pill-btn ${isSelected ? 'selected' : ''}" data-area="${area}" ${!isCompatible ? 'style="opacity: 0.65;"' : ''}>
            ${isSelected ? '✓ ' : ''}${area}
          </button>
        `;
      });
      areaGrid.innerHTML = areaHtml;

      areaGrid.querySelectorAll('.area-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const areaVal = btn.getAttribute('data-area');
          currentModalSelectedArea = areaVal;
          areaGrid.querySelectorAll('.area-pill-btn').forEach(b => {
            const bArea = b.getAttribute('data-area');
            if (bArea === areaVal) {
              b.classList.add('selected');
              b.textContent = '✓ ' + bArea;
            } else {
              b.classList.remove('selected');
              b.textContent = bArea;
            }
          });
        });
      });
    }
  }

  // Preencher Demais Características (R3 a R12)
  const demaisContainer = document.getElementById('confirm-demais-regras-container');
  if (demaisContainer) {
    let demaisHtml = '';
    const demaisRules = SUPPORT_RULES.filter(r => r.id !== 'R1' && r.id !== 'R2' && r.id !== 'R13');
    demaisRules.forEach(r => {
      const isChecked = slot.regrasPrevistas && slot.regrasPrevistas.includes(r.id);
      demaisHtml += `
        <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: var(--text-primary); cursor: pointer; padding: 3px 4px;">
          <input type="checkbox" name="confirm-op-regras" value="${r.id}" ${isChecked ? 'checked' : ''} style="width: auto; margin-top: 2px;">
          <span style="line-height: 1.3;"><strong style="color: var(--text-primary);">${r.id}</strong> - <span style="color: var(--text-secondary);">${r.descricao}</span> <small style="color: var(--info); font-weight: 600;">(Peso ${r.peso})</small></span>
        </label>
      `;
    });
    demaisContainer.innerHTML = demaisHtml;

    demaisContainer.querySelectorAll('input[name="confirm-op-regras"]').forEach(cb => {
      cb.addEventListener('change', () => updateConfirmPointsPreview(regimeBase));
    });
  }

  updateConfirmPointsPreview(regimeBase);

  // Verificar se o usuário atual possui débitos
  const debts = autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE');
  const hasDebt = debts.length > 0;

  if (hasDebt) {
    const sorted = [...debts].sort((a, b) => a.dataFolga.localeCompare(b.dataFolga));
    const oldest = sorted[0];
    
    if (confirmModalText) {
      confirmModalText.textContent = `Você possui ${debts.length} débito(s) de autotrocra ativo(s). Este apoio será utilizado para quitar seu débito mais antigo (referente à folga de ${formatDatePt(oldest.dataFolga)}).`;
    }
    if (normalContainer) normalContainer.style.display = 'none';
    if (autotrocaWrapper) autotrocaWrapper.style.display = 'none';
    if (paybackContainer) paybackContainer.style.display = 'block';
  } else {
    if (confirmModalText) {
      confirmModalText.textContent = isSub 
        ? "Você está prestes a substituir o operador atual por possuir maior prioridade no ranking. Selecione a modalidade de acúmulo:" 
        : "Selecione a modalidade na qual você deseja assumir este apoio:";
    }
    if (normalContainer) normalContainer.style.display = 'block';
    if (autotrocaWrapper) autotrocaWrapper.style.display = 'block';
    if (paybackContainer) paybackContainer.style.display = 'none';
  }

  if (confirmDataFolga) {
    confirmDataFolga.value = '';
  }

  confirmAssumeModal.style.display = 'flex';
}

function updateConfirmPointsPreview(regimeBase) {
  const pointsPreview = document.getElementById('confirm-points-preview');
  if (!pointsPreview) return;

  const checkedCbs = document.querySelectorAll('input[name="confirm-op-regras"]:checked');
  const checkedRules = Array.from(checkedCbs).map(cb => cb.value);
  const allRules = [regimeBase, ...checkedRules];

  const score = calculateSupportScore(allRules);
  pointsPreview.textContent = score.toFixed(2);
}

function handleConfirmAssumeSelection(isAutotroca, isPayback = false) {
  const folgaDate = confirmDataFolga ? confirmDataFolga.value : '';

  if (isAutotroca && !folgaDate) {
    showBanner('Por favor, informe a data em que deseja folgar.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === currentModalSlotId);
  const slotAreas = slot ? (slot.areasFuncoes || []) : [];

  if (slotAreas.length > 0 && !currentModalSelectedArea) {
    showBanner('Por favor, selecione qual Área/Função você irá assumir neste apoio.', 'danger');
    return;
  }

  const selectedArea = currentModalSelectedArea || (slotAreas.length > 0 ? slotAreas[0] : '');

  const regimeBase = (slot && slot.regrasPrevistas && slot.regrasPrevistas.includes('R2')) ? 'R2' : 'R1';
  const checkedCbs = document.querySelectorAll('input[name="confirm-op-regras"]:checked');
  const checkedDemaisRules = Array.from(checkedCbs).map(cb => cb.value);
  const selectedRules = [regimeBase, ...checkedDemaisRules];

  confirmAssumeModal.style.display = 'none';

  if (currentModalIsSub) {
    executeSubstituirVaga(currentModalSlotId, isAutotroca, folgaDate, isPayback, selectedRules, selectedArea);
  } else {
    executeAssumirVagaDireta(currentModalSlotId, isAutotroca, folgaDate, isPayback, selectedRules, selectedArea);
  }
}

function handleAssumirVagaDireta(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  if (!currentUser || !isCurrentUserOperador()) {
    showBanner('Apenas apoiadores podem assumir escalas.', 'danger');
    return;
  }

  // Verificar compatibilidade de áreas/funções
  if (slot.areasFuncoes && slot.areasFuncoes.length > 0) {
    const userAreas = currentUser.areasFuncoes || [];
    const isCompatible = slot.areasFuncoes.some(area => userAreas.includes(area));
    if (!isCompatible) {
      showBanner('Você não possui as áreas/funções de atuação necessárias para assumir este apoio.', 'danger');
      return;
    }
  }

  if (slot.data < simulatedCurrentDate) {
    showBanner('Não é possível assumir vagas de apoio do histórico (datas passadas).', 'danger');
    return;
  }

  const alreadyHasSupport = slots.some(s => s.usuarioId === currentUser.id && s.data === slot.data && s.status === 'ATRIBUIDO' && s.id !== slotId);
  if (alreadyHasSupport) {
    showBanner('Você já possui um apoio atribuído para esta data.', 'danger');
    return;
  }

  openConfirmAssumeModal(slotId, false);
}

function executeAssumirVagaDireta(slotId, isAutotroca, folgaDate = '', isPayback = false, selectedRules = null, selectedArea = null) {
  if (!currentUser || !isCurrentUserOperador()) {
    showBanner('Apenas apoiadores podem assumir escalas.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const regimeBase = (slot.regrasPrevistas && slot.regrasPrevistas.includes('R2')) ? 'R2' : 'R1';
  const finalSelectedRules = selectedRules || slot.regrasPrevistas || [regimeBase];
  const finalSelectedArea = selectedArea || slot.areaAssumida || (slot.areasFuncoes && slot.areasFuncoes.length > 0 ? slot.areasFuncoes[0] : '');

  const debts = autotrocas.filter(at => at.usuarioId === currentUser.id && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE');
  const userHasDebt = debts.length > 0;
  const finalIsPayback = isPayback || userHasDebt;

  const slotHours = calculateSupportHours(slot.horaInicio || '07:00', slot.horaTermino || '19:00');
  const currentHours = getUserMonthlySupportHours(currentUser.id, slot.data);
  const needsAuthorization = (currentHours + slotHours) > currentConfig.monthlyHoursLimit;
  const monthlyCount = getUserMonthlySupportCount(currentUser.id, slot.data);

  slots = slots.map(s => {
    if (s.id === slotId) {
      const updated = {
        ...s,
        status: 'ATRIBUIDO',
        usuarioId: currentUser.id,
        regrasPrevistas: finalSelectedRules,
        areaAssumida: finalSelectedArea
      };
      if (finalIsPayback) {
        updated.autotrocaPayback = true;
        delete updated.autotroca;
        delete updated.dataFolgaPretendida;
      } else if (isAutotroca) {
        updated.autotroca = true;
        updated.dataFolgaPretendida = folgaDate;
        delete updated.autotrocaPayback;
      } else {
        delete updated.autotroca;
        delete updated.dataFolgaPretendida;
        delete updated.autotrocaPayback;
      }
      if (needsAuthorization) {
        updated.requerAutorizacao = true;
        delete updated.autorizadoPorId;
      } else {
        delete updated.requerAutorizacao;
        delete updated.autorizadoPorId;
      }
      return updated;
    }
    return s;
  });

  const historyId = 'h_' + Date.now();
  
  const supportDate = new Date(slot.data + 'T00:00:00');
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
  const eAtrasado = (currentConfig && currentConfig.penaltiesEnabled) && ((simDate - supportDate) > (3 * 24 * 60 * 60 * 1000));
  
  const finalRegras = eAtrasado ? ['R13'] : finalSelectedRules;
  const score = calculateSupportScore(finalRegras);

  const subgrupoText = finalIsPayback 
    ? slot.subgrupo + ' (Quitação Autotroca)'
    : (isAutotroca ? slot.subgrupo + ' (Autotroca)' : slot.subgrupo);

  const novoHistorico = {
    id: historyId,
    usuarioId: currentUser.id,
    data: slot.data,
    grupoId: slot.grupoId || '',
    subgrupo: subgrupoText,
    causaRaiz: slot.motivo || 'Composição de Turno',
    regras: finalRegras,
    pontuacao: score,
    dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
    registradoPorId: currentUser.id,
    areaFuncao: finalSelectedArea
  };
  if (isAutotroca && !finalIsPayback) {
    novoHistorico.isAutotroca = true;
  }

  history = [...history, novoHistorico];

  if (finalIsPayback) {
    fulfillAutotrocaPayback(currentUser.id, slot.id, slot.data);
  } else if (isAutotroca) {
    const autotrocaId = 'at_' + Date.now();
    const novaAutotroca = {
      id: autotrocaId,
      usuarioId: currentUser.id,
      tipo: 'NORMAL',
      status: 'PENDENTE_APROVACAO',
      dataSolicitacao: simulatedCurrentDate,
      dataApoio: slot.data,
      dataFolga: folgaDate,
      scheduledPaybackDate: folgaDate,
      paybackFulfilled: false,
      slotId: slot.id,
      historyId: historyId
    };
    autotrocas = [...autotrocas, novaAutotroca];
  }

  if (needsAuthorization) {
    showBanner(`Vaga assumida para ${formatDatePt(slot.data)}, mas este é o seu ${monthlyCount + 1}º apoio no mês. Aguardando autorização gerencial.`, 'warning');
  } else {
    showBanner(`Vaga de apoio confirmada para ${formatDatePt(slot.data)} (${score.toFixed(2)} pts)!`, 'success');
  }
  
  persistChanges(['slots', 'history', 'autotrocas']);
}

function handleCandidatarDisputa(slotId) {
  if (!currentUser || !isCurrentUserOperador()) {
    showBanner('Apenas apoiadores podem se candidatar.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];

  // Verificar compatibilidade de áreas/funções
  if (slot.areasFuncoes && slot.areasFuncoes.length > 0) {
    const userAreas = currentUser.areasFuncoes || [];
    const isCompatible = slot.areasFuncoes.some(area => userAreas.includes(area));
    if (!isCompatible) {
      showBanner('Você não possui as áreas/funções de atuação necessárias para se candidatar a este apoio.', 'danger');
      return;
    }
  }

  if (list.includes(currentUser.id)) {
    showBanner('Você já está inscrito nesta vaga.', 'warning');
    return;
  }

  candidatos[slotId] = [...list, currentUser.id];
  showBanner(`Candidatura na fila registrada para a vaga de ${formatDatePt(slot.data)}!`, 'success');
  persistChanges('candidatos');
}

function handleSairDisputa(slotId) {
  if (!currentUser || !isCurrentUserOperador()) {
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  const list = candidatos[slotId] || [];

  candidatos[slotId] = list.filter(cid => cid !== currentUser.id);
  showBanner(`Você saiu da fila de prioridade para a vaga de ${formatDatePt(slot?.data || '')}.`, 'info');
  persistChanges('candidatos');
}

function handleEncerrarDisputa(slotId) {
  const isGestor = isCurrentUserGestor();
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

  // Verificar limite mensal de horas de apoio para o vencedor
  const slotHours = calculateSupportHours(slot.horaInicio || '07:00', slot.horaTermino || '19:00');
  const currentHours = getUserMonthlySupportHours(vencedor.id, slot.data);
  const needsAuthorization = (currentHours + slotHours) > currentConfig.monthlyHoursLimit;

  slots = slots.map(s => {
    if (s.id === slotId) {
      const updated = { ...s, status: 'ATRIBUIDO', usuarioId: vencedor.id };
      if (needsAuthorization) {
        updated.requerAutorizacao = true;
        delete updated.autorizadoPorId;
      } else {
        delete updated.requerAutorizacao;
        delete updated.autorizadoPorId;
      }
      return updated;
    }
    return s;
  });

  const historyId = 'h_' + Date.now();
  const regras = slot.regrasPrevistas || ['R1'];
  
  const supportDate = new Date(slot.data + 'T00:00:00');
  const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
  const eAtrasado = (currentConfig && currentConfig.penaltiesEnabled) && ((simDate - supportDate) > (3 * 24 * 60 * 60 * 1000));
  
  const finalRegras = eAtrasado ? ['R13'] : regras;
  const score = calculateSupportScore(finalRegras);

  const novoHistorico = {
    id: historyId,
    usuarioId: vencedor.id,
    data: slot.data,
    grupoId: slot.grupoId || '',
    subgrupo: slot.subgrupo,
    regras: finalRegras,
    pontuacao: score,
    dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
    registradoPorId: currentUser.id
  };

  history = [...history, novoHistorico];

  if (needsAuthorization) {
    const newTotalHours = currentHours + slotHours;
    showBanner(`Disputa encerrada! Vaga atribuída a ${userVencedor.nome}, mas ele(a) acumulará ${newTotalHours}h de apoios neste mês. Aguardando autorização gerencial.`, 'warning');
  } else {
    showBanner(`Disputa encerrada! Vaga atribuída ao líder ${userVencedor.nome} (${vencedor.score.toFixed(2)} pts gerais)`, 'success');
  }
  
  delete candidatos[slotId];
  persistChanges(['slots', 'history', 'candidatos']);
}

function handleAutoRegistroApoio(e) {
  e.preventDefault();

  const regUserId = regUsuarioSelect.value;
  const regGrupo = regGrupoSelect?.value || '';
  const regSubgrupo = regSubgrupoInput.value;
  const regData = regDataInput.value;

  const isAutotroca = regIsAutotrocaCheckbox && regIsAutotrocaCheckbox.checked;
  const dataFolga = regDataFolgaInput?.value || '';

  if (!regSubgrupo || !regData) {
    showBanner('Preencha os campos obrigatórios.', 'danger');
    return;
  }

  if (isAutotroca && !dataFolga) {
    showBanner('Para registrar como Autotroca, você deve informar a data da folga pretendida.', 'danger');
    return;
  }

  const checkedAreasCbs = document.querySelectorAll('input[name="reg-areas-funcoes"]:checked');
  const regAreas = Array.from(checkedAreasCbs).map(cb => cb.value);

  if (regAreas.length === 0) {
    showBanner('Selecione pelo menos uma área/função de atuação para este apoio realizado.', 'danger');
    return;
  }

  const targetUser = users.find(u => u.id === regUserId);
  if (targetUser) {
    const userAreas = targetUser.areasFuncoes || [];
    const isCompatible = regAreas.some(area => userAreas.includes(area));
    if (!isCompatible) {
      showBanner(`O colaborador ${targetUser.nome} não possui as áreas/funções de atuação selecionadas para este apoio.`, 'danger');
      return;
    }
  }

  const isLate = isSubmissionLate();
  const isGestor = isCurrentUserGestor();
  const isBypassed = regBypassLimit && regBypassLimit.checked;
  const applyPenalty = isLate && !isBypassed && currentConfig.penaltiesEnabled;

  const regHoraInicio = regHoraInicioInput ? regHoraInicioInput.value : '07:00';
  const regHoraTermino = regHoraTerminoInput ? regHoraTerminoInput.value : '19:00';
  const regTotalHoras = calculateSupportHours(regHoraInicio, regHoraTermino);

  // Verificar limite mensal de horas de apoio
  const currentHours = getUserMonthlySupportHours(regUserId, regData);
  const newTotalHours = currentHours + regTotalHoras;
  const exceedsMonthlyLimit = newTotalHours > currentConfig.monthlyHoursLimit;

  // Se o operador está registrando para si mesmo e excede o limite, precisa de autorização
  if (exceedsMonthlyLimit && !isGestor && !editingHistoryId) {
    showBanner(`Este apoio tem ${regTotalHoras}h. Com ele, o colaborador ${users.find(u => u.id === regUserId)?.nome || 'colaborador'} acumularia ${newTotalHours}h neste mês. Apenas um Supervisor, Gerente ou Administrador pode registrar apoios além do limite de ${currentConfig.monthlyHoursLimit}h/mês.`, 'danger');
    return;
  }

  // Se for operador, aplicar restrições de hierarquia (Art. 9º)
  if (!isGestor) {
    if (regUserId !== currentUser.id) {
      if (!isLate) {
        showBanner(`Você só pode registrar apoios dentro do prazo para si mesmo. Lançamentos para terceiros só são permitidos após ${currentConfig.lateSubmissionHours}h com a penalidade R13 aplicada.`, 'danger');
        return;
      }
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
    const prevItem = history.find(h => h.id === editingHistoryId);

    history = history.map(h => {
      if (h.id === editingHistoryId) {
        const updatedItem = {
          ...h,
          usuarioId: regUserId,
          grupoId: regGrupo,
          data: regData,
          horaInicio: regHoraInicio,
          horaTermino: regHoraTermino,
          totalHoras: regTotalHoras,
          subgrupo: isAutotroca ? regSubgrupo + ' (Autotroca)' : regSubgrupo,
          regras: regras,
          pontuacao: score,
          dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
          registradoPorId: currentUser.id,
          areasFuncoes: regAreas
        };
        if (isAutotroca) {
          updatedItem.isAutotroca = true;
        } else {
          delete updatedItem.isAutotroca;
        }
        return updatedItem;
      }
      return h;
    });

    // Atualizar as autotrocas correspondentes
    if (prevItem) {
      const atIndex = autotrocas.findIndex(a => 
        a.historyId === editingHistoryId || 
        (a.usuarioId === prevItem.usuarioId && a.dataApoio === prevItem.data && a.tipo === 'NORMAL')
      );

      if (isAutotroca) {
        if (atIndex !== -1) {
          // Atualiza a autotroca existente
          autotrocas = autotrocas.map((at, idx) => {
            if (idx === atIndex) {
              return {
                ...at,
                usuarioId: regUserId,
                dataApoio: regData,
                dataFolga: dataFolga,
                scheduledPaybackDate: dataFolga,
                historyId: editingHistoryId
              };
            }
            return at;
          });
        } else {
          // Cria uma nova autotroca
          const autotrocaId = 'at_' + Date.now();
          const novaAutotroca = {
            id: autotrocaId,
            usuarioId: regUserId,
            tipo: 'NORMAL',
            status: 'PENDENTE_APROVACAO',
            dataSolicitacao: simulatedCurrentDate,
            dataApoio: regData,
            dataFolga: dataFolga,
            scheduledPaybackDate: dataFolga,
            paybackFulfilled: false,
            slotId: '',
            historyId: editingHistoryId
          };
          autotrocas = [...autotrocas, novaAutotroca];
        }
      } else {
        // Se antes era autotroca e agora não é, removemos da lista
        if (atIndex !== -1) {
          autotrocas = autotrocas.filter((_, idx) => idx !== atIndex);
        }
      }
    }

    const user = users.find(u => u.id === regUserId);
    showBanner(`Lançamento de apoio de ${user.nome} atualizado com sucesso! Nova pontuação: ${score.toFixed(4)} pts.`, 'success');
    editingHistoryId = null;
  } else {
    const historyId = 'h_' + Date.now();
    const novoHistorico = {
      id: historyId,
      usuarioId: regUserId,
      grupoId: regGrupo,
      data: regData,
      horaInicio: regHoraInicio,
      horaTermino: regHoraTermino,
      totalHoras: regTotalHoras,
      subgrupo: isAutotroca ? regSubgrupo + ' (Autotroca)' : regSubgrupo,
      causaRaiz: regCausaRaizSelect ? (regCausaRaizSelect.value || 'Outros') : 'Outros',
      regras: regras,
      pontuacao: score,
      dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
      registradoPorId: currentUser.id,
      areasFuncoes: regAreas
    };
    if (isAutotroca) {
      novoHistorico.isAutotroca = true;
    }

    history = [...history, novoHistorico];

    if (isAutotroca) {
      const autotrocaId = 'at_' + Date.now();
      const novaAutotroca = {
        id: autotrocaId,
        usuarioId: regUserId,
        tipo: 'NORMAL',
        status: 'PENDENTE_APROVACAO',
        dataSolicitacao: simulatedCurrentDate,
        dataApoio: regData,
        dataFolga: dataFolga,
        scheduledPaybackDate: dataFolga,
        paybackFulfilled: false,
        slotId: '',
        historyId: historyId
      };
      autotrocas = [...autotrocas, novaAutotroca];
    }

    const user = users.find(u => u.id === regUserId);
    showBanner(`Apoio registrado para ${user.nome}! Pontuação calculada: ${score.toFixed(4)} pts.`, 'success');
  }

  regSubgrupoInput.value = '';
  regDataInput.value = '';
  if (regGrupoSelect) regGrupoSelect.selectedIndex = 0;
  rulesCheckboxContainer.querySelectorAll('input[name="reg-regras"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="reg-areas-funcoes"]').forEach(cb => cb.checked = false);
  if (regBypassLimit) regBypassLimit.checked = false;
  if (regIsAutotrocaCheckbox) regIsAutotrocaCheckbox.checked = false;
  if (regDataFolgaInput) regDataFolgaInput.value = '';
  if (containerRegDataFolga) containerRegDataFolga.style.display = 'none';
  checkLateSubmission();

  persistChanges(['history', 'autotrocas']);
  switchView('historico');
}

function handleCancelarVagaAdmin(slotId) {
  const hasPermission = isCurrentUserGestor();
  if (!hasPermission) {
    showBanner('Você não tem permissão para cancelar ou reativar escalas.', 'danger');
    return;
  }

  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;
  const statusAtual = slot.status;
  const oldAssigneeId = slot.usuarioId;

  if (oldAssigneeId) {
    history = history.filter(h => !(h.usuarioId === oldAssigneeId && h.data === slot.data));
  }

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
  persistChanges(['slots', 'history']);
}

function handleCancelarSlotModal() {
  addModal.style.display = 'none';
  editingSlotId = null;
  const titleEl = document.getElementById('add-modal-title');
  if (titleEl) titleEl.textContent = 'Lançar Nova Solicitação de Apoio';
  addSlotForm.reset();

  document.querySelectorAll('input[name="slot-areas-funcoes"]').forEach(cb => {
    cb.checked = false;
  });

  const formUsuario = document.getElementById('form-usuario');
  if (formUsuario) {
    formUsuario.value = '';
  }

  const elMotivo = document.getElementById('form-motivo');
  if (elMotivo) {
    elMotivo.value = '';
    elMotivo.disabled = false;
  }
  
  // Hide delete button
  if (btnDeleteSlot) btnDeleteSlot.style.display = 'none';

  // Re-enable and reset date type selector
  const formTipoData = document.getElementById('form-tipo-data');
  if (formTipoData) {
    formTipoData.disabled = false;
    formTipoData.value = 'unica';
  }
  
  // Reset visibility
  const containerDataUnica = document.getElementById('container-data-unica');
  const containerDataIntervalo = document.getElementById('container-data-intervalo');
  const formDataInput = document.getElementById('form-data');
  const formDataInicioInput = document.getElementById('form-data-inicio');
  const formDataFimInput = document.getElementById('form-data-fim');
  
  if (containerDataUnica) containerDataUnica.style.display = 'block';
  if (containerDataIntervalo) containerDataIntervalo.style.display = 'none';
  if (formDataInput) formDataInput.required = true;
  if (formDataInicioInput) formDataInicioInput.required = false;
  if (formDataFimInput) formDataFimInput.required = false;

  const r1Radio = modalRulesCheckboxes?.querySelector('input[value="R1"]');
  if (r1Radio) r1Radio.checked = true;
}

function handleIniciarEdicaoEscala(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;

  const isPast = slot.data < simulatedCurrentDate;
  const isAdmin = isCurrentUserAdminOnly();
  if (isPast && !isAdmin) {
    showBanner('Apenas administradores podem editar escalas anteriores (histórico).', 'danger');
    return;
  }

  editingSlotId = slotId;
  addModal.style.display = 'flex';

  const titleEl = document.getElementById('add-modal-title');
  if (titleEl) titleEl.textContent = 'Editar Solicitação de Apoio';

  // Show delete button
  if (btnDeleteSlot) btnDeleteSlot.style.display = 'inline-flex';

  // Force single date mode and disable type selector
  const formTipoData = document.getElementById('form-tipo-data');
  if (formTipoData) {
    formTipoData.value = 'unica';
    formTipoData.disabled = true;
  }
  
  const containerDataUnica = document.getElementById('container-data-unica');
  const containerDataIntervalo = document.getElementById('container-data-intervalo');
  const formDataInput = document.getElementById('form-data');
  const formDataInicioInput = document.getElementById('form-data-inicio');
  const formDataFimInput = document.getElementById('form-data-fim');
  
  if (containerDataUnica) containerDataUnica.style.display = 'block';
  if (containerDataIntervalo) containerDataIntervalo.style.display = 'none';
  if (formDataInput) formDataInput.required = true;
  if (formDataInicioInput) formDataInicioInput.required = false;
  if (formDataFimInput) formDataFimInput.required = false;

  document.getElementById('form-grupo').value = slot.grupoId;
  document.getElementById('form-subgrupo').value = slot.subgrupo;
  document.getElementById('form-data').value = slot.data;
  
  const horaInicioVal = slot.horaInicio || ((slot.horario && slot.horario.includes('19')) ? '19:00' : '07:00');
  const horaTerminoVal = slot.horaTermino || ((slot.horario && slot.horario.includes('07') && slot.horario.startsWith('19')) ? '07:00' : '19:00');
  document.getElementById('form-hora-inicio').value = horaInicioVal;
  document.getElementById('form-hora-termino').value = horaTerminoVal;
  
  const elMotivo = document.getElementById('form-motivo');
  if (elMotivo) {
    elMotivo.value = slot.motivo || '';
    elMotivo.disabled = !isCurrentUserAdminOrSupervisor();
  }

  // Preencher o regime base (R1 ou R2)
  const isR2 = slot.regrasPrevistas && slot.regrasPrevistas.includes('R2');
  const targetRadio = modalRulesCheckboxes?.querySelector(`input[value="${isR2 ? 'R2' : 'R1'}"]`);
  if (targetRadio) targetRadio.checked = true;

  // Preencher regra de candidatura (radio buttons) - Apenas Acesso Direto
  const isDisputa = false;
  if (isDisputa) {
    document.querySelector('input[name="prioridade"][value="disputa"]').checked = true;
  } else {
    document.querySelector('input[name="prioridade"][value="imediata"]').checked = true;
  }

  const selectFormUsuario = document.getElementById('form-usuario');
  if (selectFormUsuario) {
    selectFormUsuario.value = slot.usuarioId || '';
  }

  // Preencher as áreas direcionadas da vaga
  const slotAreas = slot.areasFuncoes || [];
  document.querySelectorAll('input[name="slot-areas-funcoes"]').forEach(cb => {
    cb.checked = slotAreas.includes(cb.value);
  });

  // Atualizar a visualização de compatibilidade no select
  updateFormUsuarioSelectCompatibility();
}

function handleExcluirSlotAdmin() {
  if (!editingSlotId) return;

  const slot = slots.find(s => s.id === editingSlotId);
  if (!slot) return;

  const isPast = slot.data < simulatedCurrentDate;
  const isAdmin = isCurrentUserAdminOnly();
  if (isPast && !isAdmin) {
    showBanner('Apenas administradores podem excluir escalas anteriores (histórico).', 'danger');
    return;
  }

  // Se tiver um voluntário confirmado, precisamos de confirmação extra
  const msg = slot.usuarioId 
    ? `Esta escala possui o voluntário confirmado "${users.find(u => u.id === slot.usuarioId)?.nome || 'desconhecido'}". Deseja realmente excluí-la? (O histórico de apoios dele associado a este dia também será removido).`
    : `Tem certeza que deseja excluir esta solicitação de apoio para o dia ${formatDatePt(slot.data)}?`;

  if (confirm(msg)) {
    // 1. Remover histórico associado ao voluntário se existir
    if (slot.usuarioId) {
      history = history.filter(h => !(h.usuarioId === slot.usuarioId && h.data === slot.data));
    }

    if (slot.autotrocaPayback) {
      revertAutotrocaPayback(slot.id);
    }
    // Remover autotrocas normais (créditos) associadas a esta vaga
    autotrocas = autotrocas.filter(at => at.slotId !== slot.id || at.tipo === 'CONTRARIA');

    // 2. Remover da fila de candidaturas se houver disputa
    delete candidatos[editingSlotId];

    // 3. Remover o slot da lista de slots
    slots = slots.filter(s => s.id !== editingSlotId);

    showBanner('Solicitação de apoio excluída com sucesso!', 'info');
    
    // Fechar modal
    handleCancelarSlotModal();
    persistChanges(['slots', 'history', 'candidatos', 'autotrocas']);
  }
}

function revertAutotrocaPayback(slotId) {
  // Buscar o slot para identificar o usuário que estava ocupando
  const slot = slots.find(s => s.id === slotId);
  const occupantId = slot ? slot.usuarioId : null;

  autotrocas = autotrocas.map(at => {
    // Reverter pelo slotId (forma primária) ou pelo userId+status CONCLUIDO (fallback)
    const matchBySlot = at.slotId === slotId && at.tipo === 'CONTRARIA';
    const matchByUser = occupantId && at.usuarioId === occupantId && at.tipo === 'CONTRARIA' && at.status === 'CONCLUIDO' && at.paybackFulfilled;
    if (matchBySlot || matchByUser) {
      return {
        ...at,
        status: 'PENDENTE',
        paybackFulfilled: false,
        dataApoio: '',
        slotId: ''
      };
    }
    return at;
  });
}

function fulfillAutotrocaPayback(userId, slotId, date) {
  const pendingDebts = autotrocas.filter(at => at.usuarioId === userId && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE');
  if (pendingDebts.length > 0) {
    pendingDebts.sort((a, b) => {
      const dateA = parseDateRobust(a.dataFolga);
      const dateB = parseDateRobust(b.dataFolga);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });
    const oldestDebt = pendingDebts[0];
    autotrocas = autotrocas.map(at => {
      if (at.id === oldestDebt.id) {
        return {
          ...at,
          status: 'CONCLUIDO',
          paybackFulfilled: true,
          dataApoio: date,
          slotId: slotId
        };
      }
      return at;
    });
  }
}

function handleCriarSolicitacaoSlot(e) {
  e.preventDefault();

  const formGrupo = document.getElementById('form-grupo').value;
  const formSubgrupo = document.getElementById('form-subgrupo').value;
  const formHoraInicio = document.getElementById('form-hora-inicio')?.value || '07:00';
  const formHoraTermino = document.getElementById('form-hora-termino')?.value || '19:00';
  const formHorario = `${formHoraInicio.replace(':', '')}x${formHoraTermino.replace(':', '')}`;
  const formTotalHoras = calculateSupportHours(formHoraInicio, formHoraTermino);
  const elMotivo = document.getElementById('form-motivo');
  const formMotivo = elMotivo ? elMotivo.value : '';
  const formPrioridade = document.querySelector('input[name="prioridade"]:checked').value;
  const formTipoData = document.getElementById('form-tipo-data')?.value || 'unica';

  const selectedRegime = document.querySelector('input[name="modal-regime-base"]:checked')?.value || 'R1';
  const regrasPrevistas = [selectedRegime];
  
  const selectedUsuarioId = document.getElementById('form-usuario')?.value || null;

  if (!formSubgrupo) {
    showBanner('Preencha a atividade / subgrupo.', 'danger');
    return;
  }

  if (!formMotivo) {
    showBanner('Por favor, selecione a Causa Raiz / Motivo da Solicitação.', 'danger');
    return;
  }

  const checkedAreasCbs = document.querySelectorAll('input[name="slot-areas-funcoes"]:checked');
  const slotAreas = Array.from(checkedAreasCbs).map(cb => cb.value);

  if (slotAreas.length === 0) {
    showBanner('Você deve direcionar a vaga de apoio para pelo menos uma área/função.', 'danger');
    return;
  }

  if (selectedUsuarioId) {
    const targetUser = users.find(u => u.id === selectedUsuarioId);
    if (targetUser) {
      const userAreas = targetUser.areasFuncoes || [];
      const isCompatible = slotAreas.some(area => userAreas.includes(area));
      if (!isCompatible) {
        showBanner(`O colaborador ${targetUser.nome} não possui as áreas/funções de atuação selecionadas para este apoio.`, 'danger');
        return;
      }
    }
  }

  let datesToCreate = [];

  if (editingSlotId) {
    const originalSlot = slots.find(s => s.id === editingSlotId);
    if (originalSlot) {
      const isPast = originalSlot.data < simulatedCurrentDate;
      const isAdmin = isCurrentUserAdminOnly();
      if (isPast && !isAdmin) {
        showBanner('Apenas administradores podem editar escalas anteriores (histórico).', 'danger');
        return;
      }
    }
    // Modo de edição: sempre data única
    const formData = document.getElementById('form-data').value;
    if (!formData) {
      showBanner('Preencha a data.', 'danger');
      return;
    }
    datesToCreate.push(formData);
  } else {
    // Modo de criação
    if (formTipoData === 'unica') {
      const formData = document.getElementById('form-data').value;
      if (!formData) {
        showBanner('Preencha a data.', 'danger');
        return;
      }
      datesToCreate.push(formData);
    } else {
      // Intervalo de datas
      const formDataInicio = document.getElementById('form-data-inicio').value;
      const formDataFim = document.getElementById('form-data-fim').value;
      if (!formDataInicio || !formDataFim) {
        showBanner('Preencha as datas inicial e final do intervalo.', 'danger');
        return;
      }

      const dateStart = new Date(formDataInicio + 'T00:00:00');
      const dateEnd = new Date(formDataFim + 'T00:00:00');

      if (dateEnd < dateStart) {
        showBanner('A data final deve ser posterior ou igual à data inicial.', 'danger');
        return;
      }

      let tempDate = new Date(dateStart);
      while (tempDate <= dateEnd) {
        const yyyy = tempDate.getFullYear();
        const mm = String(tempDate.getMonth() + 1).padStart(2, '0');
        const dd = String(tempDate.getDate()).padStart(2, '0');
        datesToCreate.push(`${yyyy}-${mm}-${dd}`);
        tempDate.setDate(tempDate.getDate() + 1);
      }
    }
  }

  if (editingSlotId) {
    const formData = datesToCreate[0];
    const slot = slots.find(s => s.id === editingSlotId);
    if (slot) {
      const oldUsuarioId = slot.usuarioId;
      const newUsuarioId = selectedUsuarioId;

      if (slot.autotrocaPayback && oldUsuarioId !== newUsuarioId) {
        revertAutotrocaPayback(slot.id);
        slot.autotrocaPayback = false;
      }

      // 1. Gerenciar histórico correspondente
      if (oldUsuarioId && oldUsuarioId !== newUsuarioId) {
        // Se tinha um usuário e ele mudou ou foi removido, apaga o histórico do antigo para este dia
        history = history.filter(h => !(h.usuarioId === oldUsuarioId && h.data === slot.data));
        // Remove também o registro de autotrocra normal (crédito) do antigo
        autotrocas = autotrocas.filter(at => !(at.usuarioId === oldUsuarioId && at.slotId === slot.id && at.tipo === 'NORMAL'));
      }

      if (newUsuarioId) {
        const regras = regrasPrevistas || ['R1'];
        const supportDate = new Date(formData + 'T00:00:00');
        const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
        const eAtrasado = (currentConfig && currentConfig.penaltiesEnabled) && ((simDate - supportDate) > (3 * 24 * 60 * 60 * 1000));
        const finalRegras = eAtrasado ? ['R13'] : regras;
        const score = calculateSupportScore(finalRegras);

        if (oldUsuarioId === newUsuarioId) {
          // Se for o mesmo usuário, atualiza o registro existente no histórico
          history = history.map(h => {
            if (h.usuarioId === oldUsuarioId && h.data === slot.data) {
              return {
                ...h,
                data: formData,
                grupoId: formGrupo,
                subgrupo: formSubgrupo,
                horaInicio: formHoraInicio,
                horaTermino: formHoraTermino,
                totalHoras: formTotalHoras,
                regras: finalRegras,
                pontuacao: score
              };
            }
            return h;
          });
        } else {
          // Se for um novo usuário atribuído a esta vaga, cria um novo histórico
          const historyId = 'h_' + Date.now();
          const novoHistorico = {
            id: historyId,
            usuarioId: newUsuarioId,
            data: formData,
            grupoId: formGrupo,
            subgrupo: formSubgrupo,
            horaInicio: formHoraInicio,
            horaTermino: formHoraTermino,
            totalHoras: formTotalHoras,
            regras: finalRegras,
            pontuacao: score,
            dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
            registradoPorId: currentUser.id
          };
          history = [...history, novoHistorico];
        }
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
            horaInicio: formHoraInicio,
            horaTermino: formHoraTermino,
            status: newUsuarioId ? 'ATRIBUIDO' : 'LIVRE',
            usuarioId: newUsuarioId,
            regrasPrevistas: regrasPrevistas,
            areasFuncoes: slotAreas
          };
          
          if (newUsuarioId) {
            const slotHours = calculateSupportHours(formHoraInicio, formHoraTermino);
            const currentHours = getUserMonthlySupportHours(newUsuarioId, formData);
            const needsAuthorization = (currentHours + slotHours) > currentConfig.monthlyHoursLimit;
            if (needsAuthorization) {
              updated.requerAutorizacao = true;
              updated.autorizadoPorId = currentUser.id; // Pré-autorizado pelo admin
            } else {
              delete updated.requerAutorizacao;
              delete updated.autorizadoPorId;
            }
          } else {
            delete updated.requerAutorizacao;
            delete updated.autorizadoPorId;
          }

          const debts = newUsuarioId ? autotrocas.filter(at => at.usuarioId === newUsuarioId && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE') : [];
          const newAssigneeHasDebt = debts.length > 0;

          if (newAssigneeHasDebt) {
            updated.autotrocaPayback = true;
            fulfillAutotrocaPayback(newUsuarioId, slot.id, formData);
          } else {
            delete updated.autotrocaPayback;
          }

          if (oldUsuarioId !== newUsuarioId || !newUsuarioId) {
            delete updated.autotroca;
            delete updated.dataFolgaPretendida;
          }

          if (formMotivo) {
            updated.motivo = formMotivo;
          } else {
            delete updated.motivo;
          }
          return updated;
        }
        return s;
      });
    }

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
    // Criar novo slot ou múltiplos slots (para intervalo)
    datesToCreate.forEach((dStr, idx) => {
      const slotId = 's_' + Date.now() + '_' + idx;
      
      let needsAuthorization = false;
      if (selectedUsuarioId) {
        const slotHours = calculateSupportHours(formHoraInicio, formHoraTermino);
        const currentHours = getUserMonthlySupportHours(selectedUsuarioId, dStr);
        needsAuthorization = (currentHours + slotHours) > currentConfig.monthlyHoursLimit;
      }

      const novoSlot = {
        id: slotId,
        grupoId: formGrupo,
        subgrupo: formSubgrupo,
        data: dStr,
        horario: formHorario,
        horaInicio: formHoraInicio,
        horaTermino: formHoraTermino,
        status: selectedUsuarioId ? 'ATRIBUIDO' : 'LIVRE',
        usuarioId: selectedUsuarioId,
        observacao: '',
        requerAutorizacao: selectedUsuarioId ? needsAuthorization : false,
        autorizadoPorId: (selectedUsuarioId && needsAuthorization) ? currentUser.id : null,
        regrasPrevistas: regrasPrevistas,
        areasFuncoes: slotAreas
      };

      const debts = selectedUsuarioId ? autotrocas.filter(at => at.usuarioId === selectedUsuarioId && at.tipo === 'CONTRARIA' && at.status === 'PENDENTE') : [];
      const assigneeHasDebt = debts.length > 0;

      if (assigneeHasDebt) {
        novoSlot.autotrocaPayback = true;
        fulfillAutotrocaPayback(selectedUsuarioId, slotId, dStr);
      }

      if (formMotivo) {
        novoSlot.motivo = formMotivo;
      }

      slots = [...slots, novoSlot];

      if (selectedUsuarioId) {
        // Criar registro de histórico
        const historyId = 'h_' + Date.now() + '_' + idx;
        const regras = regrasPrevistas || ['R1'];
        const supportDate = new Date(dStr + 'T00:00:00');
        const simDate = new Date(simulatedCurrentDate + 'T00:00:00');
        const eAtrasado = (currentConfig && currentConfig.penaltiesEnabled) && ((simDate - supportDate) > (3 * 24 * 60 * 60 * 1000));
        const finalRegras = eAtrasado ? ['R13'] : regras;
        const score = calculateSupportScore(finalRegras);

        const novoHistorico = {
          id: historyId,
          usuarioId: selectedUsuarioId,
          data: dStr,
          grupoId: formGrupo,
          subgrupo: formSubgrupo,
          causaRaiz: formMotivo || 'Composição de Turno',
          horaInicio: formHoraInicio,
          horaTermino: formHoraTermino,
          totalHoras: formTotalHoras,
          regras: finalRegras,
          pontuacao: score,
          dataRegistro: new Date(simulatedCurrentDate + 'T12:00:00').toISOString(),
          registradoPorId: currentUser.id
        };
        history = [...history, novoHistorico];
      }

      if (formPrioridade === 'disputa') {
        candidatos[slotId] = [];
      }
    });

    if (datesToCreate.length > 1) {
      showBanner(`${datesToCreate.length} novas escalas de apoio cadastradas com sucesso!`, 'success');
    } else {
      showBanner('Nova escala de apoio cadastrada!', 'success');
    }
  }

  // Limpar formulário e fechar modal
  handleCancelarSlotModal();
  persistChanges(['slots', 'history', 'candidatos', 'autotrocas']);
}

function handleAplicarInfracao(e) {
  e.preventDefault();

  if (!isCurrentUserAdminOnly() && (currentUser && currentUser.tipo !== 'GERENTE')) {
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
  
  persistChanges('users');
}

function handleExcluirHistorico(historyId) {
  const item = history.find(h => h.id === historyId);
  const user = users.find(u => u.id === item?.usuarioId);

  history = history.filter(h => h.id !== historyId);
  
  if (item && item.isAutotroca) {
    autotrocas = autotrocas.filter(a => 
      a.historyId !== historyId && 
      !(a.usuarioId === item.usuarioId && a.dataApoio === item.data && a.tipo === 'NORMAL')
    );
    persistChanges(['history', 'autotrocas']);
  } else {
    persistChanges('history');
  }
  
  showBanner(`Registro do dia ${formatDatePt(item?.data || '')} de ${user?.nome || 'colaborador'} excluído do histórico.`, 'info');
}

// --- INTEGRAÇÃO WHATSAPP ---
function openWhatsappExporter() {
  whatsappExportArea.value = generateWhatsappTemplate();
  whatsappModal.style.display = 'flex';
}

function formatHorarioHoraCheia(horario) {
  if (!horario) return '';
  let h = horario.replace(/(\d{2})00x(\d{2})00/g, '$1x$2');
  h = h.replace(/:00/g, '');
  return h;
}

function generateWhatsappTemplate() {
  let output = '';

  // Chamada de atenção para vagas em aberto hoje e amanhã
  const todayStr = simulatedCurrentDate;
  const todayDate = new Date(todayStr + 'T00:00:00');
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);
  const yyyy = tomorrowDate.getFullYear();
  const mm = String(tomorrowDate.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrowDate.getDate()).padStart(2, '0');
  const tomorrowStr = `${yyyy}-${mm}-${dd}`;

  const openSlotsTodayOrTomorrow = slots.filter(s => 
    (s.data === todayStr || s.data === tomorrowStr) && 
    s.status === 'LIVRE'
  );

  if (openSlotsTodayOrTomorrow.length > 0) {
    output += `============================\n`;
    output += `        🚨 *ATENÇÃO* 🚨\n`;
    output += ` *APOIO EM ABERTO HOJE e AMANHÃ!*\n`;
    output += `============================\n\n`;
    openSlotsTodayOrTomorrow.forEach(s => {
      const group = groups.find(g => g.id === s.grupoId);
      const groupName = group ? group.nome : 'Sem Grupo';
      output += `• *${groupName}* - ${s.subgrupo} em *${formatDatePt(s.data)}* (${formatHorarioHoraCheia(s.horario)})\n`;
    });
    output += `\n👉 Cadastre-se no sistema antes que as vagas sejam preenchidas!\n`;
    output += `============================\n\n`;
  }

  groups.forEach(group => {
    const groupSlots = slots.filter(s => s.grupoId === group.id && s.data >= simulatedCurrentDate);
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
        let emoji = '🟢';

        if (s.status === 'CANCELADO') {
          userText = '*CANCELADO*';
          emoji = '⚪';
        } else if (s.status === 'ATRIBUIDO') {
          emoji = '🔴';
          if (u) {
            const displayNickname = u.apelido || (u.nome ? u.nome.trim().split(' ')[0] : 'Desconhecido');
            const monthlyCount = getUserMonthlySupportCount(u.id, s.data);
            const monthlyHours = getUserMonthlySupportHours(u.id, s.data);
            
            const letterMap = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
            const letterRep = monthlyCount > 0 ? (letterMap[monthlyCount] || `[${monthlyCount}]`) : '0';
            const rep = monthlyCount > 0 ? `${letterRep}${monthlyHours}` : '0';

            if (u.id === currentUser.id) {
              userText = `👉 *${displayNickname} (${rep}) (VOCÊ)* 👈`;
              emoji = '⭐';
            } else {
              userText = `${displayNickname} (${rep})`;
            }
          } else {
            userText = 'Desconhecido';
          }
        } else {
          emoji = '🟢';
          userText = 'Livre';
        }

        output += `${emoji} ${formatDatePt(s.data)} - ${formatHorarioHoraCheia(s.horario)}: ${userText}\n`;
      });
      
      output += `\n`;
    });

    output += `*-----------------------------------*\n\n`;
  });

  output += `Obs.: Se o número total de horas de apoios no mês ultrapassar ${currentConfig.monthlyHoursLimit}h, será solicitada autorização gerencial.\n`;
  output += `Obrigado!\n\n`;
  output += `Acesse o sistema: https://app-apoio-rnest.web.app/?org=${encodeURIComponent(orgId)}\n`;

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

// --- RELATÓRIOS KPI (DASHBOARD DE INDICADORES) ---

let kpiChartMonthly = null;
let kpiChartWeekday = null;
let kpiChartRules = null;
let kpiFiltersInitialized = false;

function initKpiFilters() {
  if (kpiFiltersInitialized) return;
  kpiFiltersInitialized = true;

  const monthSelect = document.getElementById('kpi-filter-month');
  const yearSelect = document.getElementById('kpi-filter-year');
  const btnExport = document.getElementById('btn-kpi-export');

  if (monthSelect) {
    const meses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    monthSelect.innerHTML = '<option value="all">Todos os Meses</option>';
    meses.forEach((m, i) => {
      const val = String(i + 1).padStart(2, '0');
      monthSelect.innerHTML += `<option value="${val}">${m}</option>`;
    });
    monthSelect.addEventListener('change', () => renderRelatorios());
  }

  if (yearSelect) {
    // Detectar anos disponíveis no histórico
    const anos = new Set();
    history.forEach(h => {
      if (h.data) anos.add(h.data.substring(0, 4));
    });
    if (anos.size === 0) anos.add('2026');
    yearSelect.innerHTML = '';
    [...anos].sort().forEach(a => {
      yearSelect.innerHTML += `<option value="${a}">${a}</option>`;
    });
    yearSelect.addEventListener('change', () => renderRelatorios());
  }

  if (btnExport) {
    btnExport.addEventListener('click', () => exportKpiCsv());
  }
}

function getKpiFilteredHistory() {
  const monthSelect = document.getElementById('kpi-filter-month');
  const yearSelect = document.getElementById('kpi-filter-year');
  const selectedMonth = monthSelect ? monthSelect.value : 'all';
  const selectedYear = yearSelect ? yearSelect.value : '2026';

  return history.filter(h => {
    if (!h.data) return false;
    const year = h.data.substring(0, 4);
    const month = h.data.substring(5, 7);
    if (year !== selectedYear) return false;
    if (selectedMonth !== 'all' && month !== selectedMonth) return false;
    return true;
  });
}

function renderRelatorios() {
  if (!isCurrentUserGestor()) return;

  initKpiFilters();

  const filtered = getKpiFilteredHistory();
  const monthSelect = document.getElementById('kpi-filter-month');
  const selectedMonth = monthSelect ? monthSelect.value : 'all';

  // --- KPI CARDS ---
  const totalApoios = filtered.length;
  const totalHorasApoio = filtered.reduce((acc, h) => acc + (h.totalHoras || 0), 0);
  const mediaHorasApoio = totalApoios > 0 ? (totalHorasApoio / totalApoios).toFixed(1) : '0';

  // Mês atual
  const hoje = simulatedCurrentDate;
  const mesAtual = hoje.substring(0, 7); // YYYY-MM
  const apoiosMesAtual = history.filter(h => h.data && h.data.substring(0, 7) === mesAtual).length;

  // Mês anterior (tendência)
  const [anoAtual, mAtual] = mesAtual.split('-').map(Number);
  const mesAnteriorDate = new Date(anoAtual, mAtual - 2, 1);
  const mesAnteriorStr = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;
  const apoiosMesAnterior = history.filter(h => h.data && h.data.substring(0, 7) === mesAnteriorStr).length;
  const tendenciaVal = apoiosMesAnterior > 0 ? (((apoiosMesAtual - apoiosMesAnterior) / apoiosMesAnterior) * 100).toFixed(1) : null;
  const tendenciaText = tendenciaVal === null ? 'Sem dados ant.' : (parseFloat(tendenciaVal) > 0 ? `\u2191 +${tendenciaVal}%` : parseFloat(tendenciaVal) < 0 ? `\u2193 ${tendenciaVal}%` : '\u2192 Est\u00e1vel');
  const tendenciaColor = tendenciaVal === null ? 'var(--text-muted)' : (parseFloat(tendenciaVal) > 0 ? 'var(--danger)' : parseFloat(tendenciaVal) < 0 ? 'var(--success)' : 'var(--info)');

  // Média de apoios por mês
  const mesesComDados = new Set();
  filtered.forEach(h => {
    if (h.data) mesesComDados.add(h.data.substring(0, 7));
  });
  const mediaApoiosMes = mesesComDados.size > 0 ? (totalApoios / mesesComDados.size).toFixed(1) : '0';

  // Colaboradores ativos
  const colabAtivos = new Set();
  filtered.forEach(h => colabAtivos.add(h.usuarioId));

  // ICA
  const elegiveisTotal = users.filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN').length;
  const top20Count = Math.max(1, Math.ceil(elegiveisTotal * 0.2));
  const countMapICA = {};
  filtered.forEach(h => { countMapICA[h.usuarioId] = (countMapICA[h.usuarioId] || 0) + 1; });
  const sortedCountsICA = Object.values(countMapICA).sort((a, b) => b - a);
  const top20Total = sortedCountsICA.slice(0, top20Count).reduce((s, v) => s + v, 0);
  const icaVal = totalApoios > 0 ? Math.round((top20Total / totalApoios) * 100) : 0;
  const icaColor = icaVal >= 60 ? 'var(--danger)' : icaVal >= 40 ? 'var(--warning)' : 'var(--success)';
  const icaLabel = icaVal >= 60 ? '\ud83d\udd34 Alta' : icaVal >= 40 ? '\ud83d\udfe1 Aten\u00e7\u00e3o' : '\ud83d\udfe2 Saud\u00e1vel';

  // TUP
  const tupVal = elegiveisTotal > 0 ? Math.round((colabAtivos.size / elegiveisTotal) * 100) : 0;
  const tupColor = tupVal < 30 ? 'var(--danger)' : tupVal > 70 ? 'var(--warning)' : 'var(--success)';
  const tupLabel = tupVal < 30 ? '\ud83d\udd34 Ocioso' : tupVal > 70 ? '\ud83d\udfe1 Press\u00e3o' : '\ud83d\udfe2 OK';

  // AGM
  const agmCount = slots.filter(s => s.status === 'aguardando_aprovacao' && s.data && s.data.substring(0, 7) === mesAtual).length;
  const agmColor = agmCount > 0 ? 'var(--warning)' : 'var(--success)';

  // Áreas/Funções Assumidas
  const areaCountsMap = {};
  filtered.forEach(h => {
    const area = h.areaFuncao || h.areaAssumida;
    if (area) {
      areaCountsMap[area] = (areaCountsMap[area] || 0) + 1;
    }
  });
  const qtdAreasDiferentes = Object.keys(areaCountsMap).length;
  const sortedAreas = Object.entries(areaCountsMap).sort((a, b) => b[1] - a[1]);
  const topAreaName = sortedAreas.length > 0 ? sortedAreas[0][0] : 'Nenhuma';
  const topAreaCount = sortedAreas.length > 0 ? sortedAreas[0][1] : 0;
  const topAreaPct = totalApoios > 0 ? Math.round((topAreaCount / totalApoios) * 100) : 0;

  // Pontuação média
  const pontuacaoMedia = totalApoios > 0
    ? (filtered.reduce((sum, h) => sum + h.pontuacao, 0) / totalApoios).toFixed(2)
    : '0.00';

  const cardsContainer = document.getElementById('kpi-cards-container');
  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div class="kpi-card kpi-card--primary">
        <div class="kpi-card-header"><span class="kpi-label">Total de Apoios</span><span class="kpi-icon">&#x1F4CB;</span></div>
        <span class="kpi-value">${totalApoios}</span>
        <span class="kpi-sublabel">No período selecionado</span>
      </div>
      <div class="kpi-card kpi-card--success">
        <div class="kpi-card-header"><span class="kpi-label">Total de Horas</span><span class="kpi-icon">⏱️</span></div>
        <span class="kpi-value">${totalHorasApoio}h</span>
        <span class="kpi-sublabel">Horas acumuladas no período</span>
      </div>
      <div class="kpi-card kpi-card--info">
        <div class="kpi-card-header"><span class="kpi-label">Média Horas / Apoio</span><span class="kpi-icon">📊</span></div>
        <span class="kpi-value">${mediaHorasApoio}h</span>
        <span class="kpi-sublabel">Duração média por evento</span>
      </div>
      <div class="kpi-card kpi-card--info" style="border: 1px solid var(--info);">
        <div class="kpi-card-header"><span class="kpi-label">Áreas/Funções Assumidas</span><span class="kpi-icon">📍</span></div>
        <span class="kpi-value" style="color: var(--info);">${qtdAreasDiferentes} áreas</span>
        <span class="kpi-sublabel">${topAreaCount > 0 ? `Mais atuada: ${topAreaName} (${topAreaPct}%)` : 'Sem dados de áreas'}</span>
      </div>
      <div class="kpi-card kpi-card--info">
        <div class="kpi-card-header"><span class="kpi-label">Apoios no Mês Atual</span><span class="kpi-icon">&#x1F4C5;</span></div>
        <span class="kpi-value">${apoiosMesAtual}</span>
        <span class="kpi-sublabel">${formatMonthName(mesAtual)}</span>
      </div>
      <div class="kpi-card kpi-card--success">
        <div class="kpi-card-header"><span class="kpi-label">Média / Mês</span><span class="kpi-icon">&#x1F4CA;</span></div>
        <span class="kpi-value">${mediaApoiosMes}</span>
        <span class="kpi-sublabel">${mesesComDados.size} mês(es) com dados</span>
      </div>
      <div class="kpi-card kpi-card--primary">
        <div class="kpi-card-header"><span class="kpi-label">Colaboradores Ativos</span><span class="kpi-icon">&#x1F465;</span></div>
        <span class="kpi-value">${colabAtivos.size}</span>
        <span class="kpi-sublabel">Com ≥1 apoio no período</span>
      </div>
      <div class="kpi-card" style="background:var(--bg-card);border:1px solid ${icaColor};border-radius:var(--radius-md);padding:20px;display:flex;flex-direction:column;gap:8px;">
        <div class="kpi-card-header"><span class="kpi-label">Concentração (ICA)</span><span class="kpi-icon">&#x1F3AF;</span></div>
        <span class="kpi-value" style="color:${icaColor}">${icaVal}%</span>
        <span class="kpi-sublabel">${icaLabel} — top ${top20Count} fazem ${icaVal}% dos apoios</span>
      </div>
      <div class="kpi-card" style="background:var(--bg-card);border:1px solid ${tupColor};border-radius:var(--radius-md);padding:20px;display:flex;flex-direction:column;gap:8px;">
        <div class="kpi-card-header"><span class="kpi-label">Cobertura do Plantel (TUP)</span><span class="kpi-icon">&#x1F465;</span></div>
        <span class="kpi-value" style="color:${tupColor}">${tupVal}%</span>
        <span class="kpi-sublabel">${tupLabel} — ${colabAtivos.size} de ${elegiveisTotal} elíggiveis</span>
      </div>
      <div class="kpi-card" style="background:var(--bg-card);border:1px solid ${agmColor};border-radius:var(--radius-md);padding:20px;display:flex;flex-direction:column;gap:8px;">
        <div class="kpi-card-header"><span class="kpi-label">Aprovações Pendentes (AGM)</span><span class="kpi-icon">✅</span></div>
        <span class="kpi-value" style="color:${agmColor}">${agmCount}</span>
        <span class="kpi-sublabel">${agmCount > 0 ? '🚨 Aguardando aprovação este mês' : '✅ Nenhuma pendente'}</span>
      </div>
      <div class="kpi-card" style="background:var(--bg-card);border:1px solid ${tendenciaColor};border-radius:var(--radius-md);padding:20px;display:flex;flex-direction:column;gap:8px;">
        <div class="kpi-card-header"><span class="kpi-label">Tendência (vs Mês Ant.)</span><span class="kpi-icon">&#x1F4C8;</span></div>
        <span class="kpi-value" style="color:${tendenciaColor};font-size:1.5rem;">${tendenciaText}</span>
        <span class="kpi-sublabel">${apoiosMesAnterior} apoios em ${formatMonthName(mesAnteriorStr)}</span>
      </div>
    `;
  }

  // --- GRÁFICOS ---
  renderKpiChartMonthly(filtered, selectedMonth);
  renderKpiChartWeekday(filtered);
  renderKpiChartRules(filtered);
  renderKpiChartCausaRaiz(filtered);
  renderKpiChartSemana(filtered);
  renderKpiChartAreas(filtered);

  // --- TABELAS ---
  renderKpiTopApoiadores(filtered);
  renderKpiSemApoio(filtered);
  renderKpiIRI();
  renderKpiInfracoes();
}

function formatMonthName(monthStr) {
  if (!monthStr || monthStr.length < 7) return '';
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const parts = monthStr.split('-');
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${meses[monthIdx] || ''} ${parts[0]}`;
}

// --- CHART: Apoios por Mês ---
function renderKpiChartMonthly(filtered, selectedMonth) {
  const canvas = document.getElementById('kpi-chart-monthly');
  if (!canvas || typeof Chart === 'undefined') return;

  // Agrupar por mês
  const monthCounts = {};
  const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // Se "Todos os Meses", mostrar todos os meses do ano
  if (selectedMonth === 'all') {
    // Inicializar todos os meses com 0
    mesesNomes.forEach((m, i) => {
      const key = String(i + 1).padStart(2, '0');
      monthCounts[key] = 0;
    });

    filtered.forEach(h => {
      if (h.data) {
        const m = h.data.substring(5, 7);
        monthCounts[m] = (monthCounts[m] || 0) + 1;
      }
    });

    const labels = Object.keys(monthCounts).sort().map(k => mesesNomes[parseInt(k, 10) - 1]);
    const data = Object.keys(monthCounts).sort().map(k => monthCounts[k]);

    if (kpiChartMonthly) kpiChartMonthly.destroy();
    kpiChartMonthly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Apoios',
          data,
          backgroundColor: data.map((_, i) => `hsla(${245 + i * 10}, 80%, 65%, 0.7)`),
          borderColor: data.map((_, i) => `hsl(${245 + i * 10}, 80%, 65%)`),
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: getChartOptions('Quantidade de Apoios')
    });
  } else {
    // Mês específico: agrupar por semana
    const weekCounts = {};
    filtered.forEach(h => {
      if (h.data) {
        const day = parseInt(h.data.substring(8, 10), 10);
        const week = `Sem ${Math.ceil(day / 7)}`;
        weekCounts[week] = (weekCounts[week] || 0) + 1;
      }
    });

    const labels = Object.keys(weekCounts).sort();
    const data = labels.map(k => weekCounts[k]);

    if (kpiChartMonthly) kpiChartMonthly.destroy();
    kpiChartMonthly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Apoios',
          data,
          backgroundColor: 'hsla(245, 80%, 65%, 0.7)',
          borderColor: 'hsl(245, 80%, 65%)',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: getChartOptions('Quantidade de Apoios')
    });
  }
}

// --- CHART: Apoios por Dia da Semana ---
function renderKpiChartWeekday(filtered) {
  const canvas = document.getElementById('kpi-chart-weekday');
  if (!canvas || typeof Chart === 'undefined') return;

  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];

  filtered.forEach(h => {
    if (h.data) {
      const parts = h.data.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) {
        dayCounts[d.getDay()]++;
      }
    }
  });

  const colors = [
    'hsla(0, 70%, 55%, 0.7)',    // Dom
    'hsla(210, 70%, 55%, 0.7)',  // Seg
    'hsla(190, 80%, 50%, 0.7)',  // Ter
    'hsla(142, 70%, 50%, 0.7)',  // Qua
    'hsla(38, 80%, 55%, 0.7)',   // Qui
    'hsla(280, 70%, 55%, 0.7)',  // Sex
    'hsla(330, 70%, 55%, 0.7)'   // Sab
  ];

  if (kpiChartWeekday) kpiChartWeekday.destroy();
  kpiChartWeekday = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: diasSemana,
      datasets: [{
        label: 'Apoios',
        data: dayCounts,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.7', '1')),
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: getChartOptions('Quantidade')
  });
}

// --- CHART: Distribuição por Característica ---
function renderKpiChartRules(filtered) {
  const canvas = document.getElementById('kpi-chart-rules');
  if (!canvas || typeof Chart === 'undefined') return;

  const ruleCounts = {};
  supportRules.forEach(r => { ruleCounts[r.id] = 0; });

  filtered.forEach(h => {
    if (h.regras) {
      h.regras.forEach(rid => {
        ruleCounts[rid] = (ruleCounts[rid] || 0) + 1;
      });
    }
  });

  const labels = supportRules.map(r => `${r.id}: ${r.descricao.substring(0, 35)}${r.descricao.length > 35 ? '...' : ''}`);
  const data = supportRules.map(r => ruleCounts[r.id] || 0);

  if (kpiChartRules) kpiChartRules.destroy();
  kpiChartRules = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ocorrências',
        data,
        backgroundColor: supportRules.map((_, i) => `hsla(${200 + i * 12}, 75%, 55%, 0.7)`),
        borderColor: supportRules.map((_, i) => `hsl(${200 + i * 12}, 75%, 55%)`),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      ...getChartOptions('Ocorrências'),
      indexAxis: 'y'
    }
  });
}

// --- CHART: Distribuição por Causa Raiz (Donut) ---
let kpiChartCausaRaiz = null;
function renderKpiChartCausaRaiz(filtered) {
  const canvas = document.getElementById('kpi-chart-causa-raiz');
  if (!canvas || typeof Chart === 'undefined') return;
  const causaCounts = {};
  filtered.forEach(h => {
    const causa = h.causaRaiz || 'Outros';
    causaCounts[causa] = (causaCounts[causa] || 0) + 1;
  });
  const labels = Object.keys(causaCounts);
  const data = Object.values(causaCounts);
  const palette = [
    'hsla(245,80%,65%,0.85)','hsla(142,70%,50%,0.85)','hsla(38,80%,55%,0.85)',
    'hsla(0,70%,55%,0.85)','hsla(190,80%,50%,0.85)','hsla(280,70%,55%,0.85)',
    'hsla(330,70%,55%,0.85)','hsla(60,80%,55%,0.85)','hsla(210,70%,55%,0.85)'
  ];
  if (kpiChartCausaRaiz) kpiChartCausaRaiz.destroy();
  if (labels.length === 0) return;
  kpiChartCausaRaiz = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: labels.map((_,i) => palette[i % palette.length]), borderColor: 'hsla(222,47%,12%,0.8)', borderWidth: 2, hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: 'hsl(215,16%,70%)', font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 14 } },
        tooltip: {
          backgroundColor: 'hsla(222,47%,12%,0.95)', titleColor: '#fff', bodyColor: 'hsl(215,20%,75%)',
          borderColor: 'hsla(222,47%,22%,0.6)', borderWidth: 1, cornerRadius: 8, padding: 12,
          callbacks: { label: ctx => { const total = ctx.dataset.data.reduce((s,v) => s+v,0); return ` ${ctx.label}: ${ctx.parsed} (${((ctx.parsed/total)*100).toFixed(1)}%)`; } }
        }
      }
    }
  });
}

// --- CHART: Apoios por Semana do Mês (Heatmap-bar) ---
let kpiChartSemana = null;
function renderKpiChartSemana(filtered) {
  const canvas = document.getElementById('kpi-chart-semana');
  if (!canvas || typeof Chart === 'undefined') return;
  const weekCounts = { 'Sem 1': 0, 'Sem 2': 0, 'Sem 3': 0, 'Sem 4': 0, 'Sem 5': 0 };
  filtered.forEach(h => {
    if (h.data) {
      const day = parseInt(h.data.substring(8,10), 10);
      const sem = `Sem ${Math.min(5, Math.ceil(day/7))}`;
      weekCounts[sem] = (weekCounts[sem] || 0) + 1;
    }
  });
  const labels = Object.keys(weekCounts);
  const data = Object.values(weekCounts);
  const maxVal = Math.max(...data, 1);
  if (kpiChartSemana) kpiChartSemana.destroy();
  kpiChartSemana = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Apoios', data,
        backgroundColor: data.map(v => { const p = v/maxVal; return `hsla(245,80%,${40 + p*25}%,${0.4 + p*0.55})`; }),
        borderColor: 'hsl(245,80%,65%)', borderWidth: 1, borderRadius: 6, borderSkipped: false
      }]
    },
    options: getChartOptions('Quantidade')
  });
}

// --- CHART: Distribuição por Área/Função Assumida ---
let kpiChartAreas = null;
function renderKpiChartAreas(filtered) {
  const canvas = document.getElementById('kpi-chart-areas');
  if (!canvas || typeof Chart === 'undefined') return;

  const areaCounts = {};
  filtered.forEach(h => {
    const area = h.areaFuncao || h.areaAssumida || 'Não Informada';
    areaCounts[area] = (areaCounts[area] || 0) + 1;
  });

  const sorted = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const data = sorted.map(e => e[1]);

  if (kpiChartAreas) kpiChartAreas.destroy();
  if (labels.length === 0) return;

  const palette = [
    'hsla(190,80%,50%,0.85)', 'hsla(210,80%,55%,0.85)', 'hsla(142,70%,50%,0.85)',
    'hsla(280,70%,55%,0.85)', 'hsla(38,80%,55%,0.85)', 'hsla(0,70%,55%,0.85)',
    'hsla(245,80%,65%,0.85)', 'hsla(60,80%,55%,0.85)'
  ];

  kpiChartAreas = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Apoios Assumidos',
        data,
        backgroundColor: labels.map((_, i) => palette[i % palette.length]),
        borderColor: 'hsla(222,47%,12%,0.8)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsla(222,47%,12%,0.95)', titleColor: '#fff', bodyColor: 'hsl(215,20%,75%)',
          borderColor: 'hsla(222,47%,22%,0.6)', borderWidth: 1, cornerRadius: 8, padding: 12,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.y} apoio(s)` }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'hsl(215,16%,70%)', stepSize: 1 },
          grid: { color: 'hsla(222,47%,20%,0.4)' }
        },
        x: {
          ticks: { color: 'hsl(215,16%,70%)', font: { family: 'Inter', size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// --- Chart.js theme options ---
function getChartOptions(yLabel) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'claro';
  const labelColor = isLight ? '#1a3b2b' : 'hsl(215, 16%, 70%)';
  const gridColor = isLight ? 'rgba(0, 133, 66, 0.12)' : 'hsla(222, 47%, 22%, 0.3)';
  const tooltipBg = isLight ? 'rgba(10, 26, 18, 0.94)' : 'hsla(222, 47%, 12%, 0.95)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: '#fff',
        bodyColor: 'hsl(215, 20%, 85%)',
        borderColor: isLight ? 'rgba(0, 133, 66, 0.25)' : 'hsla(222, 47%, 22%, 0.6)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' }
      }
    },
    scales: {
      x: {
        ticks: {
          color: labelColor,
          font: { family: 'Inter', size: 11, weight: '600' },
          maxRotation: 45
        },
        grid: {
          color: gridColor,
          drawBorder: false
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: yLabel,
          color: labelColor,
          font: { family: 'Inter', size: 12, weight: '700' }
        },
        ticks: {
          color: labelColor,
          font: { family: 'Inter', size: 11, weight: '600' },
          precision: 0
        },
        grid: {
          color: gridColor,
          drawBorder: false
        }
      }
    }
  };
}

// --- TABELA: Top 15 Apoiadores ---
function renderKpiTopApoiadores(filtered) {
  const tbody = document.getElementById('kpi-top-apoiadores-body');
  if (!tbody) return;

  // Contar apoios por colaborador
  const countMap = {};
  const scoreMap = {};
  const hoursMap = {};
  filtered.forEach(h => {
    countMap[h.usuarioId] = (countMap[h.usuarioId] || 0) + 1;
    scoreMap[h.usuarioId] = (scoreMap[h.usuarioId] || 0) + h.pontuacao;
    hoursMap[h.usuarioId] = (hoursMap[h.usuarioId] || 0) + (h.totalHoras || 0);
  });

  // Criar ranking
  const ranking = Object.keys(countMap).map(uid => ({
    id: uid,
    nome: users.find(u => u.id === uid)?.nome || uid,
    count: countMap[uid],
    score: scoreMap[uid],
    hours: hoursMap[uid]
  }));
  ranking.sort((a, b) => b.count - a.count || b.hours - a.hours || a.score - b.score);

  const top = ranking.slice(0, 15);
  const maxCount = top.length > 0 ? top[0].count : 1;

  if (top.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="kpi-no-data">Nenhum apoio registrado no período</td></tr>';
    return;
  }

  tbody.innerHTML = top.map((r, i) => {
    const medalClass = i === 0 ? 'kpi-rank-1' : i === 1 ? 'kpi-rank-2' : i === 2 ? 'kpi-rank-3' : 'kpi-rank-default';
    const barPct = Math.round((r.count / maxCount) * 100);
    return `
      <tr>
        <td><span class="kpi-rank-medal ${medalClass}">${i + 1}</span></td>
        <td>
          <strong style="color: var(--text-primary);">${r.nome}</strong>
          <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 6px;">${r.id.toUpperCase()}</span>
        </td>
        <td style="text-align: center; font-weight: 700; color: var(--info);">${r.count}</td>
        <td style="text-align: center; font-weight: 700; color: var(--success);">${r.hours}h</td>
        <td style="text-align: right; font-family: var(--font-mono); font-size: 0.8rem;">${r.score.toFixed(2)}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="kpi-bar-track">
              <div class="kpi-bar-inline" style="width: ${barPct}%;"></div>
            </div>
            <span style="font-size: 0.7rem; color: var(--text-muted); min-width: 28px;">${barPct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// --- TABELA: Colaboradores sem Apoio ---
function renderKpiSemApoio(filtered) {
  const container = document.getElementById('kpi-sem-apoio-container');
  if (!container) return;

  const colabComApoio = new Set();
  filtered.forEach(h => colabComApoio.add(h.usuarioId));

  // Apenas operadores elegíveis (excluir GPI/OPMAN)
  const semApoio = users.filter(u =>
    u.cargo !== 'GPI' && u.cargo !== 'OPMAN' && !colabComApoio.has(u.id)
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  if (semApoio.length === 0) {
    container.innerHTML = '<div class="kpi-no-data" style="padding: 24px;">✅ Todos os colaboradores possuem pelo menos 1 apoio no período!</div>';
    return;
  }

  let html = '<div class="table-responsive"><table class="ranking-table" style="width: 100%;"><thead><tr>';
  html += '<th>Colaborador</th><th>Chave</th><th>Cargo</th><th>Nível</th>';
  html += '</tr></thead><tbody>';

  semApoio.forEach(u => {
    html += `
      <tr>
        <td><strong style="color: var(--text-primary);">${u.nome}</strong></td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${u.id.toUpperCase()}</td>
        <td>${u.cargo || 'Operador'}</td>
        <td><span class="badge badge-${u.tipo === 'ADMINISTRADOR' ? 'assigned' : u.tipo === 'GERENTE' ? 'pending' : u.tipo === 'SUPERVISOR' ? 'open' : 'cancelled'}" style="font-size: 0.65rem;">${u.tipo}</span></td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  html += `<div style="padding: 8px 0 0; font-size: 0.75rem; color: var(--text-muted);">${semApoio.length} colaborador(es) sem apoio registrado no período</div>`;
  container.innerHTML = html;
}

// --- TABELA: Colaboradores Recorrentes (IRI) ---
function renderKpiIRI() {
  const container = document.getElementById('kpi-iri-container');
  if (!container) return;
  const hoje = simulatedCurrentDate;
  const [anoH, mesH] = hoje.split('-').map(Number);
  const ultimos6 = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(anoH, mesH - 1 - i, 1);
    ultimos6.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const elegiveis = users.filter(u => u.cargo !== 'GPI' && u.cargo !== 'OPMAN');
  const iriData = elegiveis.map(u => {
    let mesesAlerta = 0;
    const detalhe = {};
    ultimos6.forEach(mes => {
      const count = history.filter(h => h.usuarioId === u.id && h.data && h.data.substring(0,7) === mes).length;
      detalhe[mes] = count;
      if (count >= 2) mesesAlerta++;
    });
    return { ...u, mesesAlerta, detalhe };
  }).filter(u => u.mesesAlerta >= 3).sort((a,b) => b.mesesAlerta - a.mesesAlerta);

  if (iriData.length === 0) {
    container.innerHTML = '<div class="kpi-no-data" style="padding:24px;">\u2705 Nenhum colaborador com padr\u00e3o de sobrecarga recorrente nos \u00faltimos 6 meses.</div>';
    return;
  }
  const mNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const headerMeses = ultimos6.map(m => { const [a,mo] = m.split('-'); return `<th style="text-align:center;font-size:0.72rem;">${mNomes[parseInt(mo,10)-1]}/${a.slice(2)}</th>`; }).join('');
  let html = `<div class="table-responsive"><table class="ranking-table" style="width:100%;"><thead><tr><th>Colaborador</th><th>Chave</th>${headerMeses}<th style="text-align:center;">Meses \u26a0\ufe0f</th></tr></thead><tbody>`;
  iriData.forEach(u => {
    const cells = ultimos6.map(mes => {
      const c = u.detalhe[mes];
      const s = c >= 2 ? 'background:hsla(0,70%,55%,0.15);color:var(--danger);' : c === 1 ? 'background:hsla(38,80%,55%,0.1);color:var(--warning);' : 'color:var(--text-muted);';
      return `<td style="text-align:center;font-weight:600;font-size:0.85rem;${s}">${c > 0 ? c : '\u2014'}</td>`;
    }).join('');
    const ac = u.mesesAlerta >= 5 ? 'color:var(--danger);' : u.mesesAlerta >= 4 ? 'color:var(--warning);' : 'color:var(--info);';
    html += `<tr><td><strong style="color:var(--text-primary);">${u.nome}</strong></td><td style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);">${u.id.toUpperCase()}</td>${cells}<td style="text-align:center;font-weight:700;${ac}">${u.mesesAlerta}/6</td></tr>`;
  });
  html += `</tbody></table></div><div style="padding:8px 0 0;font-size:0.75rem;color:var(--text-muted);">${iriData.length} colaborador(es) com padr\u00e3o recorrente \u2014 Considere redistribui\u00e7\u00e3o de carga.</div>`;
  container.innerHTML = html;
}

// --- TABELA: Infrações de WhatsApp ---
function renderKpiInfracoes() {
  const section = document.getElementById('kpi-infracoes-section');
  const tbody = document.getElementById('kpi-infracoes-body');
  if (!section || !tbody) return;

  const comInfracoes = users.filter(u => u.infracoesWA && u.infracoesWA > 0)
    .sort((a, b) => b.infracoesWA - a.infracoesWA);

  if (comInfracoes.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  tbody.innerHTML = comInfracoes.map(u => `
    <tr>
      <td><strong style="color: var(--text-primary);">${u.nome}</strong></td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${u.id.toUpperCase()}</td>
      <td style="text-align: center; font-weight: 700; color: var(--danger);">${u.infracoesWA}</td>
      <td style="text-align: right; font-family: var(--font-mono); color: var(--danger);">+${(u.infracoesWA * 0.01).toFixed(2)}</td>
    </tr>
  `).join('');
}

// --- EXPORTAR CSV ---
function exportKpiCsv() {
  const filtered = getKpiFilteredHistory();

  if (filtered.length === 0) {
    showBanner('Nenhum dado para exportar no período selecionado.', 'warning');
    return;
  }

  const headers = ['Data Apoio', 'Colaborador', 'Chave', 'Área/Atividade', 'Regras', 'Pontuação', 'Data Registro'];
  const rows = filtered.map(h => {
    const user = users.find(u => u.id === h.usuarioId);
    return [
      h.data,
      user ? user.nome : h.usuarioId,
      h.usuarioId.toUpperCase(),
      `"${(h.subgrupo || '').replace(/"/g, '""')}"`,
      (h.regras || []).join('+'),
      h.pontuacao.toFixed(4),
      h.dataRegistro || ''
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio_apoios_kikai_${orgId}_${simulatedCurrentDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showBanner(`Relatório exportado com ${filtered.length} registro(s)!`, 'success');
}

// --- LEI DE APOIO POPUP & MARKDOWN PARSER ---


async function openLeiModal() {
  leiModal.style.display = 'flex';
  leiModalBody.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando regulamento... ⏳</div>';
  
  try {
    const res = await fetch('./lei_apoio.md');
    if (!res.ok) throw new Error('Não foi possível carregar o arquivo lei_apoio.md');
    const mdText = await res.text();
    leiModalBody.innerHTML = parseMarkdown(mdText);
  } catch (error) {
    console.error(error);
    leiModalBody.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--danger);">
        ⚠️ Erro ao carregar o regulamento local: ${error.message}.
      </div>
    `;
  }
}

function parseMarkdown(md) {
  let html = md;
  
  // Clean carriage returns
  html = html.replace(/\r\n/g, '\n');
  
  // Headers
  html = html.replace(/^# (.*$)/gim, '<h1 style="font-size: 1.4rem; font-family: var(--font-heading); margin-top: 16px; margin-bottom: 12px; color: var(--info); text-align: center;">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="font-size: 1.15rem; font-family: var(--font-heading); margin-top: 16px; margin-bottom: 10px; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3 style="font-size: 1.0rem; font-family: var(--font-heading); margin-top: 12px; margin-bottom: 8px; color: var(--text-secondary);">$1</h3>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary);">$1</strong>');
  
  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: var(--info); text-decoration: underline;">$1</a>');
  html = html.replace(/<(https?:\/\/.*?)>/g, '<a href="$1" target="_blank" style="color: var(--info); text-decoration: underline;">$1</a>');
  
  // Lines parsing for tables & lists
  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<div class="table-responsive" style="margin-top: 15px; margin-bottom: 15px;"><table class="ranking-table" style="width:100%;"><thead>';
      }
      
      const cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      if (lines[i+1] && (lines[i+1].includes('---|') || lines[i+1].includes('- |') || lines[i+1].includes('--- |'))) {
        tableHtml += '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        i++; // skip separator line
      } else {
        tableHtml += '<tr>' + cols.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    } else {
      if (inTable) {
        inTable = false;
        tableHtml += '</tbody></table></div>';
        lines[i] = tableHtml + '\n' + lines[i];
      }
    }
  }
  html = lines.join('\n');
  
  // Paragraphs and lists
  const blocks = html.split('\n\n');
  const parsedBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<table') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<p')) {
      return trimmed;
    }
    // Handle list points
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const items = trimmed.split('\n').map(li => {
        const itemContent = li.replace(/^[\*\-]\s+/, '');
        return `<li style="margin-bottom: 4px;">${itemContent}</li>`;
      });
      return `<ul style="margin-left: 20px; margin-bottom: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">${items.join('')}</ul>`;
    }
    return `<p style="margin-bottom: 12px; line-height: 1.6; color: var(--text-secondary);">${trimmed.replace(/\n/g, '<br>')}</p>`;
  });
  
  return parsedBlocks.join('\n');
}

// --- UTILITÁRIOS PARA IMPORTAÇÃO/EXPORTAÇÃO DE CSV ---

function valueToCsvField(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    return val.join(';');
  }
  let str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseCsv(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        row[row.length - 1] += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push("");
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += c;
      }
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 1. Exportação
function exportUsersToCSV() {
  const headers = ['id', 'nome', 'apelido', 'email', 'tipo', 'cargo', 'infracoesWA', 'areasFuncoes', 'grupoTrabalho'];
  let csv = headers.join(',') + '\n';
  users.forEach(u => {
    const row = [
      u.id,
      u.nome,
      u.apelido || u.nome.split(' ')[0],
      u.email,
      u.tipo,
      u.cargo,
      u.infracoesWA !== undefined ? u.infracoesWA : 0,
      (u.areasFuncoes || []).join(';'),
      u.grupoTrabalho || ''
    ];
    csv += row.map(valueToCsvField).join(',') + '\n';
  });
  downloadCSV(csv, `usuarios_${getTodayStr()}.csv`);
}

function exportSlotsToCSV() {
  const headers = ['id', 'grupoId', 'subgrupo', 'data', 'horario', 'status', 'usuarioId', 'observacao', 'regrasPrevistas', 'areasFuncoes'];
  let csv = headers.join(',') + '\n';
  slots.forEach(s => {
    const row = [
      s.id,
      s.grupoId,
      s.subgrupo,
      s.data,
      s.horario,
      s.status,
      s.usuarioId || '',
      s.observacao || '',
      (s.regrasPrevistas || []).join(';'),
      (s.areasFuncoes || []).join(';')
    ];
    csv += row.map(valueToCsvField).join(',') + '\n';
  });
  downloadCSV(csv, `vagas_apoio_${getTodayStr()}.csv`);
}

function exportHistoryToCSV() {
  const headers = ['id', 'usuarioId', 'data', 'subgrupo', 'regras', 'pontuacao', 'dataRegistro', 'registradoPorId', 'areasFuncoes'];
  let csv = headers.join(',') + '\n';
  history.forEach(h => {
    const row = [
      h.id,
      h.usuarioId,
      h.data,
      h.subgrupo,
      (h.regras || []).join(';'),
      h.pontuacao,
      h.dataRegistro,
      h.registradoPorId || '',
      (h.areasFuncoes || []).join(';')
    ];
    csv += row.map(valueToCsvField).join(',') + '\n';
  });
  downloadCSV(csv, `historico_lancamentos_${getTodayStr()}.csv`);
}

// 2. Importação
function handleImportUsersCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const mode = modeImportUsers.value;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = parseCsv(text);
    if (lines.length < 2) {
      showBanner("Erro: O arquivo CSV está vazio ou inválido.", "danger");
      return;
    }
    
    const headers = lines[0].map(h => h.trim().toLowerCase());
    const idIdx = headers.indexOf('id');
    const nomeIdx = headers.indexOf('nome');
    const apelidoIdx = headers.indexOf('apelido');
    const emailIdx = headers.indexOf('email');
    const tipoIdx = headers.indexOf('tipo');
    const cargoIdx = headers.indexOf('cargo');
    const infracoesIdx = headers.indexOf('infracoeswa');
    const areasIdx = headers.indexOf('areasfuncoes');
    const grupoTrabalhoIdx = headers.indexOf('grupotrabalho');
    
    if (idIdx === -1 || nomeIdx === -1 || emailIdx === -1) {
      showBanner("Erro: Colunas obrigatórias 'id', 'nome' e 'email' não encontradas.", "danger");
      return;
    }
    
    if (mode === 'replace') {
      const securityWord = prompt("ATENÇÃO PERIGO DE PERDA DE DADOS:\nEsta ação irá APAGAR E SUBSTITUIR todos os usuários cadastrados no sistema.\n\nPara confirmar esta operação, digite exatamente a palavra 'CONFIRMAR' abaixo:");
      if (securityWord !== 'CONFIRMAR') {
        showBanner("Operação de importação de usuários cancelada por segurança.", "warning");
        event.target.value = '';
        return;
      }
    } else {
      if (!confirm("Isso irá MESCLAR/ATUALIZAR os usuários no sistema. Confirma?")) {
        event.target.value = '';
        return;
      }
    }
    
    const importedUsers = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length < headers.length) continue;
      const id = row[idIdx].trim().toUpperCase();
      if (!id) continue;
      
      const cargo = cargoIdx !== -1 ? row[cargoIdx].trim() : 'Operador';
      const tipo = tipoIdx !== -1 ? row[tipoIdx].trim().toUpperCase() : 'OPERADOR';
      const nome = row[nomeIdx].trim();
      const apelido = (apelidoIdx !== -1 && row[apelidoIdx] && row[apelidoIdx].trim())
        ? row[apelidoIdx].trim()
        : nome.split(' ')[0];
      
      const areasFuncoes = (areasIdx !== -1 && row[areasIdx] && row[areasIdx].trim())
        ? row[areasIdx].trim().split(';')
        : getDefaultAreasForUser({ id, cargo, tipo, nome });

      const grupoTrabalho = (grupoTrabalhoIdx !== -1 && row[grupoTrabalhoIdx] && row[grupoTrabalhoIdx].trim())
        ? row[grupoTrabalhoIdx].trim().toLowerCase()
        : getDefaultGrupoTrabalho({ id, cargo, tipo, nome });

      importedUsers.push({
        id,
        nome,
        apelido,
        email: row[emailIdx].trim(),
        tipo,
        cargo,
        infracoesWA: infracoesIdx !== -1 ? parseInt(row[infracoesIdx], 10) || 0 : 0,
        areasFuncoes,
        grupoTrabalho
      });
    }
    
    if (mode === 'replace') {
      users = importedUsers;
    } else {
      // Mesclar
      importedUsers.forEach(impUser => {
        const existingIdx = users.findIndex(u => u.id === impUser.id);
        if (existingIdx !== -1) {
          users[existingIdx] = impUser;
        } else {
          users.push(impUser);
        }
      });
    }
    
    persistChanges('users', mode === 'replace');
    showBanner(`${importedUsers.length} usuários importados com sucesso!`, "success");
    event.target.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function handleImportSlotsCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const mode = modeImportSlots.value;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = parseCsv(text);
    if (lines.length < 2) {
      showBanner("Erro: O arquivo CSV está vazio ou inválido.", "danger");
      return;
    }
    
    const headers = lines[0].map(h => h.trim().toLowerCase());
    const idIdx = headers.indexOf('id');
    const grupoIdIdx = headers.indexOf('grupoid');
    const subgrupoIdx = headers.indexOf('subgrupo');
    const dataIdx = headers.indexOf('data');
    const horarioIdx = headers.indexOf('horario');
    const statusIdx = headers.indexOf('status');
    const usuarioIdIdx = headers.indexOf('usuarioid');
    const observacaoIdx = headers.indexOf('observacao');
    const regrasPrevistasIdx = headers.indexOf('regrasprevistas');
    const areasFuncoesIdx = headers.indexOf('areasfuncoes');
    
    if (idIdx === -1 || grupoIdIdx === -1 || subgrupoIdx === -1 || dataIdx === -1) {
      showBanner("Erro: Colunas obrigatórias 'id', 'grupoId', 'subgrupo' e 'data' não encontradas.", "danger");
      return;
    }
    
    if (mode === 'replace') {
      const securityWord = prompt("ATENÇÃO PERIGO DE PERDA DE DADOS:\nEsta ação irá APAGAR E SUBSTITUIR todas as vagas de apoio (escalas) cadastradas no sistema.\n\nPara confirmar esta operação, digite exatamente a palavra 'CONFIRMAR' abaixo:");
      if (securityWord !== 'CONFIRMAR') {
        showBanner("Operação de importação de escalas cancelada por segurança.", "warning");
        event.target.value = '';
        return;
      }
    } else {
      if (!confirm("Isso irá MESCLAR/ATUALIZAR as vagas de apoio no sistema. Confirma?")) {
        event.target.value = '';
        return;
      }
    }
    
    const importedSlots = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length < headers.length) continue;
      const id = row[idIdx].trim();
      if (!id) continue;
      
      const regrasRaw = regrasPrevistasIdx !== -1 ? row[regrasPrevistasIdx].trim() : '';
      const regrasPrevistas = regrasRaw ? regrasRaw.split(';') : ['R1'];
      
      const areasRaw = areasFuncoesIdx !== -1 ? row[areasFuncoesIdx].trim() : '';
      const areasFuncoes = areasRaw ? areasRaw.split(';') : [];

      importedSlots.push({
        id,
        grupoId: row[grupoIdIdx].trim(),
        subgrupo: row[subgrupoIdx].trim(),
        data: row[dataIdx].trim(),
        horario: horarioIdx !== -1 ? row[horarioIdx].trim() : '07x19',
        status: statusIdx !== -1 ? row[statusIdx].trim().toUpperCase() : 'LIVRE',
        usuarioId: (usuarioIdIdx !== -1 && row[usuarioIdIdx].trim()) ? row[usuarioIdIdx].trim() : null,
        observacao: observacaoIdx !== -1 ? row[observacaoIdx].trim() : '',
        regrasPrevistas,
        areasFuncoes
      });
    }
    
    if (mode === 'replace') {
      slots = importedSlots;
    } else {
      // Mesclar
      importedSlots.forEach(impSlot => {
        const existingIdx = slots.findIndex(s => s.id === impSlot.id);
        if (existingIdx !== -1) {
          slots[existingIdx] = impSlot;
        } else {
          slots.push(impSlot);
        }
      });
    }
    
    persistChanges('slots', mode === 'replace');
    showBanner(`${importedSlots.length} vagas de apoio importadas com sucesso!`, "success");
    event.target.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function handleImportHistoryCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const mode = modeImportHistory.value;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = parseCsv(text);
    if (lines.length < 2) {
      showBanner("Erro: O arquivo CSV está vazio ou inválido.", "danger");
      return;
    }
    
    const headers = lines[0].map(h => h.trim().toLowerCase());
    const idIdx = headers.indexOf('id');
    const usuarioIdIdx = headers.indexOf('usuarioid');
    const dataIdx = headers.indexOf('data');
    const subgrupoIdx = headers.indexOf('subgrupo');
    const regrasIdx = headers.indexOf('regras');
    const pontuacaoIdx = headers.indexOf('pontuacao');
    const dataRegistroIdx = headers.indexOf('dataregistro');
    const registradoPorIdIdx = headers.indexOf('registradoporid');
    const areasFuncoesIdx = headers.indexOf('areasfuncoes');
    
    if (idIdx === -1 || usuarioIdIdx === -1 || dataIdx === -1 || subgrupoIdx === -1) {
      showBanner("Erro: Colunas obrigatórias 'id', 'usuarioId', 'data' e 'subgrupo' não encontradas.", "danger");
      return;
    }
    
    if (mode === 'replace') {
      const securityWord = prompt("ATENÇÃO PERIGO DE PERDA DE DADOS:\nEsta ação irá APAGAR E SUBSTITUIR todo o histórico de lançamentos cadastrado no sistema.\n\nPara confirmar esta operação, digite exatamente a palavra 'CONFIRMAR' abaixo:");
      if (securityWord !== 'CONFIRMAR') {
        showBanner("Operação de importação de histórico cancelada por segurança.", "warning");
        event.target.value = '';
        return;
      }
    } else {
      if (!confirm("Isso irá MESCLAR/ATUALIZAR o histórico de lançamentos no sistema. Confirma?")) {
        event.target.value = '';
        return;
      }
    }
    
    const importedHistory = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length < headers.length) continue;
      const id = row[idIdx].trim();
      if (!id) continue;
      
      const regrasRaw = regrasIdx !== -1 ? row[regrasIdx].trim() : '';
      const regras = regrasRaw ? regrasRaw.split(';') : ['R1'];
      const score = pontuacaoIdx !== -1 ? parseFloat(row[pontuacaoIdx]) || 1.0 : 1.0;
      
      const areasRaw = areasFuncoesIdx !== -1 ? row[areasFuncoesIdx].trim() : '';
      const areasFuncoes = areasRaw ? areasRaw.split(';') : [];

      importedHistory.push({
        id,
        usuarioId: row[usuarioIdIdx].trim(),
        data: row[dataIdx].trim(),
        subgrupo: row[subgrupoIdx].trim(),
        regras,
        pontuacao: score,
        dataRegistro: dataRegistroIdx !== -1 ? row[dataRegistroIdx].trim() : new Date().toISOString(),
        registradoPorId: registradoPorIdIdx !== -1 ? row[registradoPorIdIdx].trim() : '',
        areasFuncoes
      });
    }
    
    if (mode === 'replace') {
      history = importedHistory;
    } else {
      // Mesclar
      importedHistory.forEach(impHist => {
        const existingIdx = history.findIndex(h => h.id === impHist.id);
        if (existingIdx !== -1) {
          history[existingIdx] = impHist;
        } else {
          history.push(impHist);
        }
      });
    }
    
    persistChanges('history', mode === 'replace');
    showBanner(`${importedHistory.length} registros de histórico importados com sucesso!`, "success");
    event.target.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function updateLocalRulesFromInputs() {
  const configRulesTableBody = document.getElementById('config-rules-table-body');
  if (!configRulesTableBody) return;

  const updatedRules = [];
  const rows = configRulesTableBody.querySelectorAll('tr[data-id]');
  rows.forEach(row => {
    const id = row.getAttribute('data-id');
    const idInput = row.querySelector('.config-rule-id');
    const descInput = row.querySelector('.config-rule-desc');
    const weightInput = row.querySelector('.config-rule-weight');

    const ruleId = idInput ? idInput.value.trim().toUpperCase() : id;
    const ruleDesc = descInput ? descInput.value.trim() : '';
    const ruleWeight = weightInput ? parseInt(weightInput.value, 10) || 10 : 10;

    updatedRules.push({
      id: ruleId,
      descricao: ruleDesc,
      peso: ruleWeight
    });
  });
  
  supportRules = updatedRules;
}

function getNextRuleId() {
  let maxNum = 0;
  supportRules.forEach(r => {
    const match = r.id.match(/^R(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return `R${maxNum + 1}`;
}

function handleAddRule() {
  updateLocalRulesFromInputs();
  const nextId = getNextRuleId();
  supportRules.push({
    id: nextId,
    descricao: 'Nova Regra de Apoio',
    peso: 10
  });
  renderConfiguracoes();
}

function handleDeleteRule(ruleId) {
  if (ruleId === 'R13') {
    showBanner("A regra R13 é do sistema e não pode ser excluída.", "danger");
    return;
  }
  updateLocalRulesFromInputs();
  supportRules = supportRules.filter(r => r.id !== ruleId);
  renderConfiguracoes();
}

function updateLocalGroupsFromInputs() {
  const configGroupsTableBody = document.getElementById('config-groups-table-body');
  if (!configGroupsTableBody) return;

  const updatedGroups = [];
  const rows = configGroupsTableBody.querySelectorAll('tr[data-id]');
  rows.forEach(row => {
    const id = row.getAttribute('data-id');
    const idInput = row.querySelector('.config-group-id');
    const nomeInput = row.querySelector('.config-group-nome');
    const dataInicioInput = row.querySelector('.config-group-datainicio');
    const visibleInput = row.querySelector('.config-group-visible');

    const groupId = idInput ? idInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : id;
    const groupNome = nomeInput ? nomeInput.value.trim() : '';
    const groupDataInicio = dataInicioInput ? dataInicioInput.value : '';
    const groupVisible = visibleInput ? visibleInput.checked : true;

    updatedGroups.push({
      id: groupId,
      nome: groupNome,
      dataInicio: groupDataInicio,
      visibleInCalendar: groupVisible
    });
  });
  
  groups = updatedGroups;
}

function handleAddGroup() {
  updateLocalGroupsFromInputs();
  const newId = `grupo_${Date.now()}`;
  groups.push({
    id: newId,
    nome: 'Novo Grupo',
    dataInicio: ''
  });
  renderConfiguracoes();
}

function handleDeleteGroup(groupId) {
  const usersInGroup = users.filter(u => u.grupoTrabalho === groupId);
  const slotsInGroup = slots.filter(s => s.grupoId === groupId);
  if (usersInGroup.length > 0 || slotsInGroup.length > 0) {
    const confirmDelete = confirm(`Aviso: Este grupo está associado a ${usersInGroup.length} colaboradores e ${slotsInGroup.length} vagas de escala. Se você excluir, eles poderão ficar sem grupo de trabalho ou com escalas órfãs. Deseja prosseguir mesmo assim?`);
    if (!confirmDelete) return;
  } else {
    const confirmDelete = confirm("Deseja realmente excluir este grupo?");
    if (!confirmDelete) return;
  }

  updateLocalGroupsFromInputs();
  groups = groups.filter(g => g.id !== groupId);
  renderConfiguracoes();
}

function renderConfiguracoes() {
  const configOrgId = document.getElementById('config-org-id');
  const configShareUrl = document.getElementById('config-share-url');
  const configMonthlyLimit = document.getElementById('config-monthly-limit');
  const configLateHours = document.getElementById('config-late-hours');
  const configBumpingEnabled = document.getElementById('config-bumping-enabled');
  const configPenaltiesEnabled = document.getElementById('config-penalties-enabled');
  const configRulesTableBody = document.getElementById('config-rules-table-body');

  if (configOrgId) configOrgId.value = orgId;
  
  const shareUrl = window.location.origin + window.location.pathname + '?org=' + encodeURIComponent(orgId);
  if (configShareUrl) configShareUrl.value = shareUrl;

  if (configMonthlyLimit) configMonthlyLimit.value = currentConfig.monthlyHoursLimit;
  if (configLateHours) configLateHours.value = currentConfig.lateSubmissionHours;
  if (configBumpingEnabled) configBumpingEnabled.checked = currentConfig.bumpingEnabled;
  if (configPenaltiesEnabled) configPenaltiesEnabled.checked = currentConfig.penaltiesEnabled;

  if (configRulesTableBody) {
    let rulesHtml = '';
    supportRules.forEach(r => {
      const isR13 = r.id === 'R13';
      rulesHtml += `
        <tr data-id="${r.id}">
          <td>
            <input type="text" class="input-field config-rule-id" value="${r.id}" ${isR13 ? 'disabled' : ''} style="width: 100%; font-size: 0.85rem; font-weight: bold; text-align: center;">
          </td>
          <td>
            <input type="text" class="input-field config-rule-desc" value="${r.descricao}" style="width: 100%; font-size: 0.85rem;">
          </td>
          <td style="text-align: center;">
            <input type="number" class="input-field config-rule-weight" value="${r.peso}" min="1" max="20" style="width: 80px; text-align: center; font-size: 0.85rem; display: inline-block;">
          </td>
          <td style="text-align: center;">
            ${isR13 ? '<span style="color: var(--text-muted); font-size: 0.75rem;">Sistema</span>' : `<button type="button" class="btn btn-danger btn-delete-rule" data-id="${r.id}" style="padding: 4px 8px; font-size: 0.75rem; background: var(--danger); border-color: var(--danger); color: white;">❌ Excluir</button>`}
          </td>
        </tr>
      `;
    });
    configRulesTableBody.innerHTML = rulesHtml;

    // Vincular os cliques de exclusão
    configRulesTableBody.querySelectorAll('.btn-delete-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        handleDeleteRule(id);
      });
    });
  }

  const configGroupsTableBody = document.getElementById('config-groups-table-body');
  if (configGroupsTableBody) {
    let groupsHtml = '';
    groups.forEach(g => {
      const isSystem = ['grupo_a', 'grupo_b', 'grupo_c', 'grupo_d', 'grupo_e', 'adm'].includes(g.id);
      const dataInicioVal = g.dataInicio || GROUP_START_DATES[g.id] || '';
      groupsHtml += `
        <tr data-id="${g.id}">
          <td>
            <input type="text" class="input-field config-group-id" value="${g.id}" ${isSystem ? 'disabled' : ''} style="width: 100%; font-size: 0.85rem; font-weight: bold; text-align: center; font-family: monospace;">
          </td>
          <td>
            <input type="text" class="input-field config-group-nome" value="${g.nome}" style="width: 100%; font-size: 0.85rem;">
          </td>
          <td>
            <input type="date" class="input-field config-group-datainicio" value="${dataInicioVal}" style="width: 100%; text-align: center; font-size: 0.85rem;">
          </td>
          <td style="text-align: center;">
            <input type="checkbox" class="config-group-visible" ${g.visibleInCalendar !== false ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; vertical-align: middle;">
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-danger btn-delete-group" data-id="${g.id}" style="padding: 4px 8px; font-size: 0.75rem; background: var(--danger); border-color: var(--danger); color: white;">❌ Excluir</button>
          </td>
        </tr>
      `;
    });
    configGroupsTableBody.innerHTML = groupsHtml;

    // Vincular os cliques de exclusão de grupos
    configGroupsTableBody.querySelectorAll('.btn-delete-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        handleDeleteGroup(id);
      });
    });
  }

  // --- BLOCCO 5: ÁREAS DE ATUAÇÃO ---
  const configAreasWrapper = document.getElementById('config-areas-wrapper');
  if (configAreasWrapper) {
    let areasHtml = '';
    const activeAreas = currentConfig.areasFuncoes || AREAS_FUNCOES || {};
    
    if (!window.expandedGroups) {
      window.expandedGroups = {};
    }
    
    Object.keys(activeAreas).forEach(grupo => {
      if (window.expandedGroups[grupo] === undefined) {
        window.expandedGroups[grupo] = true;
      }
      const isExpanded = window.expandedGroups[grupo];
      const subAreas = activeAreas[grupo] || [];
      
      areasHtml += `
        <div class="glass-panel" style="padding: 12px 16px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="area-group-header" data-group="${grupo}">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.9rem; font-weight: bold; color: var(--primary);">${isExpanded ? '▼' : '▶'} ${grupo}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">(${subAreas.length} área(s))</span>
            </div>
            <div>
              <button type="button" class="btn btn-danger btn-delete-area-group" data-group="${grupo}" style="padding: 2px 8px; font-size: 0.7rem; background: var(--danger); border-color: var(--danger); color: white;">✕ Excluir Grupo</button>
            </div>
          </div>
          
          <div style="display: ${isExpanded ? 'block' : 'none'}; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color);">
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
              ${subAreas.map((area, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                  <span style="font-size: 0.85rem; color: var(--text-secondary);">${area}</span>
                  <button type="button" class="btn btn-danger btn-delete-subarea" data-group="${grupo}" data-idx="${idx}" style="padding: 2px 6px; font-size: 0.65rem; background: transparent; border: none; color: var(--danger); cursor: pointer;">✕</button>
                </div>
              `).join('')}
              ${subAreas.length === 0 ? `<div style="font-style: italic; color: var(--text-muted); font-size: 0.8rem; padding: 4px 0;">Nenhuma sub-área cadastrada.</div>` : ''}
            </div>
            
            <div style="display: flex; gap: 8px;">
              <input type="text" class="input-field input-new-subarea" placeholder="Nova sub-área (ex: CAMPO ELÉTRICA)" style="font-size: 0.8rem; padding: 4px 8px; flex: 1;">
              <button type="button" class="btn btn-primary btn-add-subarea" data-group="${grupo}" style="padding: 4px 12px; font-size: 0.8rem; white-space: nowrap;">+ Adicionar</button>
            </div>
          </div>
        </div>
      `;
    });
    
    if (Object.keys(activeAreas).length === 0) {
      areasHtml = '<div style="font-style: italic; color: var(--text-muted); font-size: 0.85rem;">Nenhum grupo de áreas configurado.</div>';
    }
    
    configAreasWrapper.innerHTML = areasHtml;
    
    // Bind clicks to toggle expand/collapse
    configAreasWrapper.querySelectorAll('.area-group-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-area-group')) return;
        const g = header.getAttribute('data-group');
        window.expandedGroups[g] = !window.expandedGroups[g];
        renderConfiguracoes();
      });
    });
    
    // Bind clicks to Delete Groups
    configAreasWrapper.querySelectorAll('.btn-delete-area-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const g = btn.getAttribute('data-group');
        if (confirm(`Tem certeza que deseja excluir o grupo "${g}" e todas as suas sub-áreas?`)) {
          if (!currentConfig.areasFuncoes) {
            currentConfig.areasFuncoes = JSON.parse(JSON.stringify(AREAS_FUNCOES));
          }
          delete currentConfig.areasFuncoes[g];
          renderConfiguracoes();
        }
      });
    });
    
    // Bind clicks to Delete Subareas
    configAreasWrapper.querySelectorAll('.btn-delete-subarea').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const g = btn.getAttribute('data-group');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (!currentConfig.areasFuncoes) {
          currentConfig.areasFuncoes = JSON.parse(JSON.stringify(AREAS_FUNCOES));
        }
        currentConfig.areasFuncoes[g].splice(idx, 1);
        renderConfiguracoes();
      });
    });
    
    // Bind clicks to Add Subarea
    configAreasWrapper.querySelectorAll('.btn-add-subarea').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const g = btn.getAttribute('data-group');
        const panel = btn.closest('.glass-panel');
        const input = panel.querySelector('.input-new-subarea');
        const val = input.value.trim().toUpperCase();
        if (!val) {
          showBanner("Digite o nome da sub-área.", "warning");
          return;
        }
        
        if (!currentConfig.areasFuncoes) {
          currentConfig.areasFuncoes = JSON.parse(JSON.stringify(AREAS_FUNCOES));
        }
        if (!currentConfig.areasFuncoes[g]) {
          currentConfig.areasFuncoes[g] = [];
        }
        
        if (currentConfig.areasFuncoes[g].includes(val)) {
          showBanner("Esta sub-área já existe neste grupo.", "warning");
          return;
        }
        
        currentConfig.areasFuncoes[g].push(val);
        renderConfiguracoes();
      });
    });
  }
}

function initConfiguracoesWiring() {
  const btnCopyShareUrl = document.getElementById('btn-copy-share-url');
  if (btnCopyShareUrl) {
    btnCopyShareUrl.addEventListener('click', () => {
      const configShareUrl = document.getElementById('config-share-url');
      if (configShareUrl) {
        configShareUrl.select();
        configShareUrl.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(configShareUrl.value)
          .then(() => showBanner("Link copiado para a área de transferência!", "success"))
          .catch(() => showBanner("Falha ao copiar o link.", "danger"));
      }
    });
  }

  const btnGoToNewOrg = document.getElementById('btn-go-to-new-org');
  const configNewOrgInput = document.getElementById('config-new-org-input');
  if (btnGoToNewOrg && configNewOrgInput) {
    btnGoToNewOrg.addEventListener('click', () => {
      const val = configNewOrgInput.value.trim().toLowerCase();
      if (!val) {
        showBanner("Digite um identificador válido para a organização.", "warning");
        return;
      }
      const sanitized = val.replace(/[^a-z0-9_-]/g, '');
      if (!sanitized) {
        showBanner("Identificador contém caracteres inválidos.", "danger");
        return;
      }
      window.location.search = '?org=' + encodeURIComponent(sanitized);
    });
  }

  const btnAddConfigRule = document.getElementById('btn-add-config-rule');
  if (btnAddConfigRule) {
    btnAddConfigRule.addEventListener('click', handleAddRule);
  }

  const btnAddConfigGroup = document.getElementById('btn-add-config-group');
  if (btnAddConfigGroup) {
    btnAddConfigGroup.addEventListener('click', handleAddGroup);
  }

  const btnAddConfigAreaGroup = document.getElementById('btn-add-config-area-group');
  if (btnAddConfigAreaGroup) {
    btnAddConfigAreaGroup.addEventListener('click', () => {
      const gName = prompt("Digite o nome do novo Grupo de Áreas (ex: MECÂNICA):");
      if (!gName) return;
      const cleanName = gName.trim().toUpperCase();
      if (!cleanName) return;
      
      if (!currentConfig.areasFuncoes) {
        currentConfig.areasFuncoes = JSON.parse(JSON.stringify(AREAS_FUNCOES));
      }
      
      if (currentConfig.areasFuncoes[cleanName]) {
        showBanner("Este grupo de áreas já existe.", "warning");
        return;
      }
      
      currentConfig.areasFuncoes[cleanName] = [];
      if (!window.expandedGroups) window.expandedGroups = {};
      window.expandedGroups[cleanName] = true;
      renderConfiguracoes();
    });
  }

  const btnSaveConfig = document.getElementById('btn-save-config');
  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', async () => {
      const configMonthlyLimit = document.getElementById('config-monthly-limit');
      const configLateHours = document.getElementById('config-late-hours');
      const configBumpingEnabled = document.getElementById('config-bumping-enabled');
      const configPenaltiesEnabled = document.getElementById('config-penalties-enabled');

      const monthlyLimitVal = parseInt(configMonthlyLimit?.value, 10) || 46;
      const lateHoursVal = parseInt(configLateHours?.value, 10) || 72;
      const bumpingVal = configBumpingEnabled ? configBumpingEnabled.checked : true;
      const penaltiesVal = configPenaltiesEnabled ? configPenaltiesEnabled.checked : true;

      // Sincroniza dados atuais do DOM para o array supportRules e grupos
      updateLocalRulesFromInputs();
      updateLocalGroupsFromInputs();

      // Validação das regras
      const ids = supportRules.map(r => r.id);
      if (ids.some(id => !id)) {
        showBanner("O código da regra não pode ficar em branco.", "danger");
        return;
      }
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        showBanner("Existem códigos de regras duplicados. Cada regra deve ter um código único.", "danger");
        return;
      }

      // Validação dos grupos
      const gIds = groups.map(g => g.id);
      if (gIds.some(id => !id)) {
        showBanner("O código/identificador do grupo não pode ficar em branco.", "danger");
        return;
      }
      const uniqueGIds = new Set(gIds);
      if (uniqueGIds.size !== gIds.length) {
        showBanner("Existem códigos de grupos duplicados. Cada grupo deve ter um código único.", "danger");
        return;
      }
      if (groups.some(g => !g.nome)) {
        showBanner("O nome do grupo não pode ficar em branco.", "danger");
        return;
      }

      currentConfig.monthlyHoursLimit = monthlyLimitVal;
      currentConfig.lateSubmissionHours = lateHoursVal;
      currentConfig.bumpingEnabled = bumpingVal;
      currentConfig.penaltiesEnabled = penaltiesVal;
      currentConfig.supportRules = supportRules;
      currentConfig.areasFuncoes = currentConfig.areasFuncoes || JSON.parse(JSON.stringify(AREAS_FUNCOES));

      try {
        await persistChanges('config');
        await persistChanges('groups');
        showBanner("Configurações e grupos salvos com sucesso!", "success");
        renderAll();
      } catch (err) {
        showBanner("Erro ao salvar configurações e grupos no banco de dados.", "danger");
      }
    });
  }

  const btnRestoreDbStructure = document.getElementById('btn-restore-db-structure');
  if (btnRestoreDbStructure) {
    btnRestoreDbStructure.addEventListener('click', async () => {
      const confirmAction = confirm("Deseja criar os documentos de configuração ('config') e grupos ('groups') no banco de dados com os valores padrão de fábrica caso estejam ausentes?");
      if (!confirmAction) return;

      try {
        await updateDocument('config', DEFAULT_CONFIG, true);
        await updateDocument('groups', INITIAL_GROUPS, true);
        
        showBanner("Estrutura do banco de dados restaurada com sucesso!", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        console.error(err);
        showBanner("Erro ao restaurar estrutura: " + (err.message || err), "danger");
      }
    });
  }
}

// Rodar na carga
let _initCalled = false;
function safeInit() {
  if (_initCalled) return;
  _initCalled = true;
  init();
}
document.addEventListener('DOMContentLoaded', safeInit);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  safeInit();
}
