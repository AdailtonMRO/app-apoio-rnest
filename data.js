// Banco de dados simulado para controle de apoios - Lei de Apoio RNEST 2025

// Regras e Pesos oficiais conforme Art. 4º da Lei Nº 0001/2025
export const SUPPORT_RULES = [
  { id: 'R1', descricao: 'TURNO - Carga Horária Doze Horas', peso: 10 },
  { id: 'R2', descricao: 'ADM - Carga Horária Oito Horas', peso: 7 },
  { id: 'R3', descricao: 'Final de Semana/Feriado (Sexta Noite a Domingo)', peso: 8 },
  { id: 'R4', descricao: 'Turno Noturno Área', peso: 8 },
  { id: 'R5', descricao: 'Turno Noturno Painel', peso: 7 },
  { id: 'R6', descricao: 'Apoio a Partida/Parada de Grandes Máquinas', peso: 7 },
  { id: 'R7', descricao: 'Apoio ao OPMAN', peso: 8 },
  { id: 'R8', descricao: 'Apoio Administrativo (Alarmes/Lógicas/Reuniões)', peso: 10 },
  { id: 'R9', descricao: 'Treinamentos (Não Obrigatórios)', peso: 10 },
  { id: 'R10', descricao: 'Interino da Supervisão', peso: 5 },
  { id: 'R11', descricao: 'Interino de CTO', peso: 7 },
  { id: 'R12', descricao: 'Meio Apoio', peso: 5 },
  { id: 'R13', descricao: 'Não Lançamento dentro do prazo (72h)', peso: 20 }
];

export const INITIAL_USERS = [
  { id: 'u1', nome: 'Syan Addi', email: 'syan@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u2', nome: 'Javã', email: 'java@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u3', nome: 'Max', email: 'max@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u4', nome: 'George Rnest', email: 'george@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u5', nome: 'Carlos André', email: 'carlos@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u6', nome: 'Joelma', email: 'joelma@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u7', nome: 'Adailton', email: 'adailton@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 1 }, // 1 infração (+0.01)
  { id: 'u8', nome: 'Eudes', email: 'eudes@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u9', nome: 'Wagner Vidal', email: 'wagner@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u10', nome: 'Isaias Moura', email: 'isaias@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u11', nome: 'Felipe Barbosa', email: 'barbosa@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u12', nome: 'Luciano Cafor', email: 'luciano@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  { id: 'u13', nome: 'Alan Bernardino', email: 'alan@rnest.com.br', tipo: 'APOIADOR', cargo: 'Operador', infracoesWA: 0 },
  
  // Cargos Administrativos Permanentes (Excluídos da Classificação conforme Art. 6º)
  { id: 'u14', nome: 'Douglas (GPI)', email: 'douglas@rnest.com.br', tipo: 'APOIADOR', cargo: 'GPI', infracoesWA: 0 },
  { id: 'u15', nome: 'Vila (OPMAN)', email: 'vila@rnest.com.br', tipo: 'APOIADOR', cargo: 'OPMAN', infracoesWA: 0 },
  
  // Gestão / Administradores
  { id: 'u16', nome: 'Georgio Polari', email: 'polari@rnest.com.br', tipo: 'ADMIN', cargo: 'Supervisor', infracoesWA: 0 },
  { id: 'u17', nome: 'Leonam (Supervisor)', email: 'leonam@rnest.com.br', tipo: 'GERENTE', cargo: 'Supervisor', infracoesWA: 0 }
];

// Histórico de Apoios Realizados (para pontuação acumulada)
export const INITIAL_HISTORY = [
  // Javã: 1 apoio em 15/05/2026 (R1 + R3 -> Turno 12h no Fim de Semana = 1.0 * 0.8 = 0.8 pontos)
  {
    id: 'h1',
    usuarioId: 'u2', // Javã
    data: '2026-05-15',
    subgrupo: 'Painel Térmico',
    regras: ['R1', 'R3'],
    pontuacao: 0.8,
    dataRegistro: '2026-05-16T10:00:00Z',
    registradoPorId: 'u2'
  },
  // Max: 1 apoio em 10/05/2026 (R1 + R3 -> 0.8 pontos). Empatado com Javã, mas com data mais antiga (10/05 vs 15/05)
  {
    id: 'h2',
    usuarioId: 'u3', // Max
    data: '2026-05-10',
    subgrupo: 'Auxiliares Térmica',
    regras: ['R1', 'R3'],
    pontuacao: 0.8,
    dataRegistro: '2026-05-11T09:00:00Z',
    registradoPorId: 'u3'
  },
  // George Rnest: 2 apoios (R1 e R2 -> 1.0 e 0.7. Total = 1.7)
  {
    id: 'h3',
    usuarioId: 'u4', // George
    data: '2026-05-10',
    subgrupo: 'Auxiliares Térmica',
    regras: ['R1'],
    pontuacao: 1.0,
    dataRegistro: '2026-05-11T12:00:00Z',
    registradoPorId: 'u4'
  },
  {
    id: 'h4',
    usuarioId: 'u4', // George
    data: '2026-05-25',
    subgrupo: 'Alarmes e Lógicas',
    regras: ['R2'],
    pontuacao: 0.7,
    dataRegistro: '2026-05-26T14:00:00Z',
    registradoPorId: 'u4'
  },
  // Carlos André: 2 apoios (R1+R3 e R1+R4 -> 0.8 e 0.8. Total = 1.6)
  {
    id: 'h5',
    usuarioId: 'u5', // Carlos André
    data: '2026-05-12',
    subgrupo: 'Painel Térmico',
    regras: ['R1', 'R3'],
    pontuacao: 0.8,
    dataRegistro: '2026-05-13T08:00:00Z',
    registradoPorId: 'u5'
  },
  {
    id: 'h6',
    usuarioId: 'u5', // Carlos André
    data: '2026-05-22',
    subgrupo: 'Turno Noturno',
    regras: ['R1', 'R4'],
    pontuacao: 0.8,
    dataRegistro: '2026-05-23T08:00:00Z',
    registradoPorId: 'u5'
  },
  // Adailton: 3 apoios (R1, R2, R12 -> 1.0, 0.7, 0.5. Total = 2.2. E tem 1 infração WA: +0.01 = 2.21)
  {
    id: 'h7',
    usuarioId: 'u7', // Adailton
    data: '2026-05-02',
    subgrupo: 'Painel Elétrico',
    regras: ['R1'],
    pontuacao: 1.0,
    dataRegistro: '2026-05-03T10:00:00Z',
    registradoPorId: 'u7'
  },
  {
    id: 'h8',
    usuarioId: 'u7', // Adailton
    data: '2026-05-18',
    subgrupo: 'Reunião de Supervisão',
    regras: ['R2'],
    pontuacao: 0.7,
    dataRegistro: '2026-05-19T09:00:00Z',
    registradoPorId: 'u7'
  },
  {
    id: 'h9',
    usuarioId: 'u7', // Adailton
    data: '2026-05-28',
    subgrupo: 'Meio Apoio',
    regras: ['R12'],
    pontuacao: 0.5,
    dataRegistro: '2026-05-29T11:00:00Z',
    registradoPorId: 'u7'
  },
  // Joelma: 1 apoio lançado atrasado (R13 penalidade -> 2.0 pontos)
  {
    id: 'h10',
    usuarioId: 'u6', // Joelma
    data: '2026-05-15',
    subgrupo: 'Painel Térmico',
    regras: ['R13'],
    pontuacao: 2.0,
    dataRegistro: '2026-05-22T10:00:00Z', // 7 dias depois
    registradoPorId: 'u16' // Lançado por outro supervisor
  }
];

export const INITIAL_GROUPS = [
  { id: 'g1', nome: 'Apoios Grupo B - Composição de Grupo' },
  { id: 'g2', nome: 'Apoio ADM' },
  { id: 'g3', nome: 'Apoios Grupo C - Escalas' },
  { id: 'g4', nome: 'Apoios Grupo D - Escalas' }
];

export const INITIAL_SLOTS = [
  // Slots futuros/abertos para teste de inscrição
  {
    id: 's_f1',
    grupoId: 'g1',
    subgrupo: 'Painel Térmico',
    data: '2026-06-10',
    horario: '07x19',
    status: 'LIVRE', // Max (na simulação original ele já tinha pego, mas aqui vamos deixar livre para simular)
    usuarioId: null,
    observacao: '',
    requerAprovacao: false,
    regrasPrevistas: ['R1']
  },
  {
    id: 's_f2',
    grupoId: 'g1',
    subgrupo: 'Auxiliares Térmica',
    data: '2026-06-12',
    horario: '07x19',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false,
    regrasPrevistas: ['R1']
  },
  {
    id: 's_f3',
    grupoId: 'g3',
    subgrupo: 'Águas Torres (Grupo C)',
    data: '2026-06-12',
    horario: '07x19',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false,
    regrasPrevistas: ['R1', 'R3'] // Turno 12h Fim de Semana
  },
  {
    id: 's_f4',
    grupoId: 'g3',
    subgrupo: 'Painel Térmico (São João)',
    data: '2026-06-23',
    horario: '19x07',
    status: 'LIVRE',
    usuarioId: null,
    observacao: '',
    requerAprovacao: false,
    regrasPrevistas: ['R1', 'R3', 'R4'] // Turno 12h Feriado/Fim de semana Noturno
  }
];

export const getStoredData = () => {
  const users = localStorage.getItem('rnest_law_users');
  const groups = localStorage.getItem('rnest_law_groups');
  const slots = localStorage.getItem('rnest_law_slots');
  const history = localStorage.getItem('rnest_law_history');

  return {
    users: users ? JSON.parse(users) : INITIAL_USERS,
    groups: groups ? JSON.parse(groups) : INITIAL_GROUPS,
    slots: slots ? JSON.parse(slots) : INITIAL_SLOTS,
    history: history ? JSON.parse(history) : INITIAL_HISTORY
  };
};

export const saveStoredData = (data) => {
  localStorage.setItem('rnest_law_users', JSON.stringify(data.users));
  localStorage.setItem('rnest_law_groups', JSON.stringify(data.groups));
  localStorage.setItem('rnest_law_slots', JSON.stringify(data.slots));
  localStorage.setItem('rnest_law_history', JSON.stringify(data.history));
};
