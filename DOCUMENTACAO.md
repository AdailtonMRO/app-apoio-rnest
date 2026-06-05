# Documentação Técnica e Características do Código

Este documento descreve as características técnicas, arquitetura, fluxos e regras de negócio implementadas no código da aplicação **Apoio RNEST - Sistema Democrático para Apoio** (regulamentada pelo Projeto de Lei Nº 0001/2025).

---

## 🛠️ 1. Arquitetura Geral da Aplicação

A aplicação foi estruturada seguindo o modelo **Vanilla Web App Premium** (HTML5 + CSS HSL + Vanilla Javascript ES6). Ela foi projetada para rodar de forma leve e direta, sem a necessidade de um ambiente de compilação pesado ou pastas complexas como `node_modules` que costumam ser bloqueadas em redes corporativas ou sincronizadores de nuvem (como o Google Drive).

### Arquivos do Projeto
*   [`index.html`](file:///G:/Meu%20Drive/Preoejto%20App%20Apoio%20RNEST/index.html): Estrutura semântica da interface do usuário (UI), contendo os modais, as abas de navegação, a sidebar de ranking e os overlays de carregamento/offline.
*   [`style.css`](file:///G:/Meu%20Drive/Preoejto%20App%20Apoio%20RNEST/style.css): Sistema visual unificado utilizando HSL (Hue, Saturation, Lightness) para uma paleta de cores harmoniosa, com estética de modo escuro, glassmorphic (`backdrop-filter`), responsividade para celulares/tablets e micro-animações de interação.
*   [`app.js`](file:///G:/Meu%20Drive/Preoejto%20App%20Apoio%20RNEST/app.js): Núcleo da lógica do sistema, gerenciando o estado global, renderização dinâmica dos elementos no DOM, validações e escuta de eventos.
*   [`data.js`](file:///G:/Meu%20Drive/Preoejto%20App%20Apoio%20RNEST/data.js): Contém as definições estáticas dos colaboradores cadastrados, o histórico inicial importado da base e as regras de pontuação oficiais (Art. 4º).
*   [`firebase-config.js`](file:///G:/Meu%20Drive/Preoejto%20App%20Apoio%20RNEST/firebase-config.js): Credenciais de conexão e configuração do projeto Firebase Console.
*   [`firebase-db.js`](file:///G:/Meu%20Drive/Preoejto%20App%20Apoio%20RNEST/firebase-db.js): Abstração do Firebase Auth (Login com Google) e Firebase Firestore (Banco de dados em tempo real), contendo também os métodos de fallback local.

---

## 🌐 2. Mecanismo de Sincronização e Resiliência (Online/Offline)

### Conexão em Tempo Real com Firestore
*   O sistema utiliza a função `onSnapshot` do Firestore para manter os dados (usuários, vagas de escala, histórico de apoios e candidaturas) sincronizados entre todos os usuários ativos instantaneamente.
*   Qualquer alteração feita por um operador ou administrador é refletida na tela de todos os outros em tempo real.

### Mecanismo de Fallback (LocalStorage)
*   Caso o Firebase não esteja configurado (credenciais em branco) ou ocorra uma falha de conexão inicial, o sistema reverte automaticamente para o **Modo Offline Simulador**.
*   Nesse modo de fallback, o estado da aplicação é persistido no `LocalStorage` do navegador (`rnest_law_*`), garantindo que os dados inseridos (usuários, escalas e apoios) não sejam resetados ao recarregar a página ou fazer login novamente.

### Monitoramento de Conectividade
*   **Detecção Imediata**: Um ouvinte no evento `window.addEventListener('offline')` detecta imediatamente se a internet do computador cair, exibindo o overlay bloqueante de erro de conexão.
*   **Timeout de Inicialização**: Ao carregar a página, se o Firebase estiver ativado mas a sincronização do banco de dados demorar mais de **6 segundos** (`connectionTimeout`), o sistema exibe o overlay bloqueante `"Sem Conexão com o Firebase"`, sugerindo que o usuário recarregue a página ou aguarde a estabilização da rede.

---

## 🔑 3. Controle de Acesso, Autenticação e Níveis Hierárquicos

### Autenticação via Firebase Auth
*   Implementada através do **Login com Google** (`signInWithPopup`).
*   Após o login, o sistema busca na lista de usuários cadastrados (`users`) um perfil cujo e-mail (ou a primeira parte do e-mail antes do `@`) corresponda à conta Google autenticada.
*   Se o e-mail não estiver pré-cadastrado no sistema, a autenticação é negada e uma mensagem de erro é exibida no overlay de login.

### Níveis Hierárquicos (`users.tipo`)
1.  **ADMINISTRADOR**: Acesso total ao sistema. Pode criar vagas de escala, excluir vagas, gerenciar usuários (adicionar/editar/remover), aplicar penalidades de WhatsApp, autorizar/rejeitar apoios pendentes e gerar relatórios.
2.  **GERENTE**: Permissões de gestão. Pode aprovar/rejeitar apoios pendentes e gerenciar usuários, além de visualizar as telas gerenciais.
3.  **SUPERVISOR**: Permissões intermediárias de fiscalização e aprovação de apoios acima do limite de 3/mês.
4.  **OPERADOR**: Perfil padrão para visualização das vagas, candidatura a vagas em disputa, registro de apoios executados e visualização do próprio painel de métricas.

### Alternador de Modo de Exibição
*   Para fins de testes, auditoria ou segurança, usuários com permissões de gestão (Admin/Gerente/Supervisor) visualizam no cabeçalho um seletor que permite alternar a visualização entre o modo **Administrador** (para gerenciar vagas e aprovações) e o modo **Operador** (para simular a visão de um colaborador comum).

---

## 📊 4. Regras de Negócio e Algoritmos do Ranking de Prioridade

O ranking é calculado em tempo real com base no histórico de apoios registrados no ano corrente.

### 1. Cálculo da Pontuação do Apoio
Conforme o **Art. 5º**, a pontuação de um apoio específico é o produtório dos pesos das características selecionadas dividido por 10:
$$\text{Pontuação do Apoio} = \prod \left(\frac{\text{Peso de } R_i}{10}\right)$$
*Exemplo:* Um apoio de Turno de 12 horas ($R_1$, peso 10) feito em um Fim de Semana ($R_3$, peso 8) terá pontuação:
$$(10 / 10) \times (8 / 10) = 1.0 \times 0.8 = 0.8 \text{ pontos}$$
*Observação:* Apoios com características mais pesadas resultam em pontuações menores, beneficiando quem os realiza para que fiquem no topo do ranking.

### 2. Classificação Geral e Critérios de Desempate
*   **Ordem**: Os colaboradores com menor soma acumulada de pontos no ano aparecem primeiro no ranking, tendo a maior prioridade para assumir novas vagas de apoio.
*   **Desempate (Art. 8º)**: Havendo empate na pontuação geral acumulada, a prioridade é dada a quem tiver o registro de apoio em data mais antiga.
*   **Exclusão (Art. 6º)**: Colaboradores com cargos de **GPI** e **OPMAN** são excluídos automaticamente da disputa e do ranking de prioridades.

### 3. Prazo de Lançamento de 72 Horas
*   Conforme o **Art. 4º**, o colaborador tem até 72 horas após o término do apoio para registrá-lo.
*   Se o sistema detectar que a data atual simulada é superior a 72 horas em relação à data do apoio (`isSubmissionLate()`), é aplicada a penalidade **R13** (Não Lançamento dentro do prazo, peso 20 / multiplicador 2.0) e as outras regras são descartadas.
*   **Ajuste Administrativo**: Um administrador ou gerente pode marcar a caixa "Ignorar prazo de 72h" ao registrar um apoio para um colaborador, evitando a aplicação da multa R13.

---

## 📅 5. Gerenciamento de Escalas e Limites Mensais

### Tipos de Vagas
*   **Vagas de Acesso Direto**: Podem ser assumidas imediatamente por qualquer operador qualificado.
*   **Vagas em Fila de Prioridade (Janela de Disputa)**: Vários operadores podem se inscrever na vaga. O sistema exibe em tempo real a lista de inscritos e destaca o "Líder da Disputa" (com base nas regras do ranking). O administrador clica em "Encerrar Disputa" para homologar e atribuir a vaga ao vencedor com maior prioridade.

### ⚠️ Regra do Limite Mensal (Autorização Gerencial)
*   Se um operador se candidatar a uma vaga direta, for vencedor de uma disputa ou registrar um apoio e isso exceder o **limite de 3 apoios no mês** (`getUserMonthlySupportCount >= 3`), a vaga entra em status de aprovação pendente.
*   O sistema exibe o aviso: **"Aguardando Aprovação Gerencial"**.
*   Botoes especiais de **Aprovar (Autorizar)** e **Recusar (Rejeitar)** aparecem para usuários com nível de Supervisor, Gerente ou Administrador.
*   Se o apoio for autorizado, ele é confirmado e armazena o ID do gestor que o aprovou. Se for rejeitado, a vaga volta a ficar livre e o histórico associado é removido.
*   No widget **"Meu Painel"**, o operador visualiza um indicador de controle mensal: "Apoios no Mês: X / 3", com alertas visuais amarelados ou avermelhados quando atinge ou supera o limite gratuito.

---

## 🔍 6. Auditoria de Lançamentos

Para evitar que operadores assumam vagas na escala e esqueçam de registrar no histórico (ou vice-versa), foi criada uma aba dedicada à **Auditoria de Apoios**.

*   O sistema executa um cruzamento de dados inteligente: busca todas as vagas de escala (`slots`) que foram atribuídas a um colaborador e verifica se existe um lançamento equivalente no histórico (`history`) na mesma data.
*   Se o lançamento equivalente for encontrado, o status exibe **Lançado ✓**.
*   Se o lançamento não for encontrado, exibe **Não Lançado ⚠️**.
*   A interface apresenta filtros rápidos por Colaborador, Status de Lançamento e intervalo de datas, além de exibir um resumo quantitativo da auditoria (ex: Vagas Atribuídas, Lançamentos Confirmados e Pendências).

---

## 💬 7. Gerador de Templates para WhatsApp

*   Para facilitar a comunicação, o sistema gera dinamicamente relatórios de escala formatados com emojis e listas ordenadas de vagas ocupadas e livres, prontos para copiar e colar no grupo oficial do WhatsApp.
*   **Link de Acesso**: Todo template gerado anexa automaticamente no rodapé o link da aplicação (`https://adailtonmro.github.io/app-apoio-rnest/`), facilitando o clique direto dos operadores a partir do celular para acessar o sistema.
