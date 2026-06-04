// Banco de dados inicial simulado para controle de apoios (RNEST)
// Salva e lê do localStorage para manter o estado persistente no navegador.

export const INITIAL_USERS = [
  { id: '1', nome: 'Syan', email: 'syan@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 0, apoiosMes: 0 },
  { id: '2', nome: 'Javã', email: 'java@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 1, apoiosMes: 2 },
  { id: '3', nome: 'Vila', email: 'vila@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 2, apoiosMes: 1 },
  { id: '4', nome: 'Douglas', email: 'douglas@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 3, apoiosMes: 0 },
  { id: '5', nome: 'Joelma', email: 'joelma@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 4, apoiosMes: 2 },
  { id: '6', nome: 'Marcelo', email: 'marcelo@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 4, apoiosMes: 1 },
  { id: '7', nome: 'Yasmin', email: 'yasmin@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 5, apoiosMes: 0 },
  { id: '8', nome: 'Alan', email: 'alan@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 6, apoiosMes: 2 },
  { id: '9', nome: 'Janderson', email: 'janderson@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 7, apoiosMes: 2 },
  { id: '10', nome: 'Adailton', email: 'adailton@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 8, apoiosMes: 0 },
  { id: '11', nome: 'Max', email: 'max@rnest.com.br', tipo: 'APOIADOR', apoiosAno: 3, apoiosMes: 0 },
  { id: '12', nome: 'Gerente Administrativo', email: 'gerente@rnest.com.br', tipo: 'GERENTE', apoiosAno: 0, apoiosMes: 0 },
  { id: '13', nome: 'Admin Operações', email: 'admin@rnest.com.br', tipo: 'ADMIN', apoiosAno: 0, apoiosMes: 0 },
];

export const INITIAL_GROUPS = [
  { id: 'g1', nome: 'Apoios Grupo B - Composição de Grupo' },
  { id: 'g2', nome: 'Apoio ADM' },
  { id: 'g3', nome: 'Apoio H.A - OPMAN Térmica' },
  { id: 'g4', nome: 'Apoio H.A - GPI Térmica' },
  { id: 'g5', nome: 'Apoio Grupo A - Composição de Grupo' }
];

export const INITIAL_SLOTS = [
  // Grupo B - Composição de Grupo
  {
    id: 's1',
    grupoId: 'g1',
    subgrupo: 'Painel Térmico ou Supervisão',
    data: '2026-06-06',
    horario: '07x19',
    status: 'ATRIBUIDO', // Max
    usuarioId: '11', // Max
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's2',
    grupoId: 'g1',
    subgrupo: 'Painel Térmico',
    data: '2026-06-06',
    horario: '07x19',
    status: 'ATRIBUIDO', // Yasmin
    usuarioId: '7',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's3',
    grupoId: 'g1',
    subgrupo: 'Painel Térmico',
    data: '2026-06-07',
    horario: '07x19',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's4',
    grupoId: 'g1',
    subgrupo: 'Painel Térmico',
    data: '2026-06-08',
    horario: '19x07',
    status: 'ATRIBUIDO', // Adailton
    usuarioId: '10',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's5',
    grupoId: 'g1',
    subgrupo: 'Painel Térmico',
    data: '2026-06-09',
    horario: '19x07',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false
  },

  // Apoio ADM - Painel Elétrico / TAF de telas do SDCD
  {
    id: 's6',
    grupoId: 'g2',
    subgrupo: 'PAINEL ELÉTRICO (TAF DE TELAS DO SDCD)',
    data: '2026-06-01',
    horario: '07x18',
    status: 'ATRIBUIDO', // Javã
    usuarioId: '2',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's7',
    grupoId: 'g2',
    subgrupo: 'PAINEL ELÉTRICO (TAF DE TELAS DO SDCD)',
    data: '2026-06-02',
    horario: '07x18',
    status: 'ATRIBUIDO', // Janderson
    usuarioId: '9',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's8',
    grupoId: 'g2',
    subgrupo: 'PAINEL ELÉTRICO (TAF DE TELAS DO SDCD)',
    data: '2026-06-03',
    horario: '07x18',
    status: 'ATRIBUIDO', // Joelma
    usuarioId: '5',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's9',
    grupoId: 'g2',
    subgrupo: 'PAINEL ELÉTRICO (TAF DE TELAS DO SDCD)',
    data: '2026-06-05',
    horario: '07x18',
    status: 'CANCELADO',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false
  },

  // Apoio ADM - Hold Point / Tela SE-1200
  {
    id: 's10',
    grupoId: 'g2',
    subgrupo: 'HOLD POINT (TELA SE-1200)',
    data: '2026-06-01',
    horario: '07x18',
    status: 'ATRIBUIDO', // Marcelo
    usuarioId: '6',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's11',
    grupoId: 'g2',
    subgrupo: 'HOLD POINT (TELA SE-1200)',
    data: '2026-06-02',
    horario: '07x18',
    status: 'ATRIBUIDO', // Javã
    usuarioId: '2',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's12',
    grupoId: 'g2',
    subgrupo: 'HOLD POINT (TELA SE-1200)',
    data: '2026-06-03',
    horario: '07x18',
    status: 'ATRIBUIDO', // Janderson
    usuarioId: '9',
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's13',
    grupoId: 'g2',
    subgrupo: 'HOLD POINT (TELA SE-1200)',
    data: '2026-06-05',
    horario: '07x18',
    status: 'ATRIBUIDO', // Alan
    usuarioId: '8',
    observacao: '',
    requerAprovacao: false
  },

  // Apoio ADM - TAF Oficinas
  {
    id: 's14',
    grupoId: 'g2',
    subgrupo: 'TAF OFICINAS',
    data: '2026-06-01',
    horario: '07x18',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false
  },
  {
    id: 's15',
    grupoId: 'g2',
    subgrupo: 'TAF OFICINAS',
    data: '2026-06-02',
    horario: '07x18',
    status: 'ATRIBUIDO', // Syan
    usuarioId: '1',
    observacao: '',
    requerAprovacao: false
  },

  // Apoio ADM - Campo Térmica caldeira
  {
    id: 's16',
    grupoId: 'g2',
    subgrupo: 'Campo Térmica Caldeira',
    data: '2026-06-02',
    horario: '07x19',
    status: 'ATRIBUIDO', // Vila
    usuarioId: '3',
    observacao: '',
    requerAprovacao: false
  },

  // Apoio H.A - OPMAN Térmica
  {
    id: 's17',
    grupoId: 'g3',
    subgrupo: 'OPMAN Térmica',
    data: '2026-06-02',
    horario: '07x16',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false
  },

  // Apoio H.A - GPI Térmica
  {
    id: 's18',
    grupoId: 'g4',
    subgrupo: 'GPI Térmica',
    data: '2026-06-03',
    horario: '07x16',
    status: 'ATRIBUIDO', // Douglas
    usuarioId: '4',
    observacao: '',
    requerAprovacao: false
  },

  // Apoio Grupo A - Composição de Grupo
  {
    id: 's19',
    grupoId: 'g5',
    subgrupo: 'Painel Térmico',
    data: '2026-06-03',
    horario: '07x19',
    status: 'ATRIBUIDO', // Javã
    usuarioId: '2',
    observacao: 'auto permuta',
    requerAprovacao: false,
    motivo: 'liberação sindical'
  }
];

export const getStoredData = () => {
  const users = localStorage.getItem('rnest_users');
  const groups = localStorage.getItem('rnest_groups');
  const slots = localStorage.getItem('rnest_slots');

  return {
    users: users ? JSON.parse(users) : INITIAL_USERS,
    groups: groups ? JSON.parse(groups) : INITIAL_GROUPS,
    slots: slots ? JSON.parse(slots) : INITIAL_SLOTS,
  };
};

export const saveStoredData = (data) => {
  localStorage.setItem('rnest_users', JSON.stringify(data.users));
  localStorage.setItem('rnest_groups', JSON.stringify(data.groups));
  localStorage.setItem('rnest_slots', JSON.stringify(data.slots));
};
