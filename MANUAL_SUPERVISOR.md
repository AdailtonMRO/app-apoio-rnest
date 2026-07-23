# Manual do Usuário - Supervisor, Gerente e Administrador
## Controle de Escalas, Limites e Autotrocas RNEST

Este manual orienta os usuários com funções de **Supervisor, Gerente e Administrador** a operar as ferramentas gerenciais do sistema Apoio RNEST, garantindo o cumprimento da **Lei Nº 0001/2025** e a consistência das escalas de apoio.

---

## 🔑 1. Perfis de Gestão e Acesso

O sistema possui três níveis de privilégios superiores à visão do Operador:
1.  **SUPERVISOR**: Visualiza e aprova solicitações de apoio que excedem o limite de 3/mês e gerencia autotrocas.
2.  **GERENTE**: Permissões de Supervisor + Gerenciamento de Usuários e aplicação de penalidades de WhatsApp.
3.  **ADMINISTRADOR**: Acesso irrestrito. Cria/edita escalas, gerencia usuários, aplica penalidades de WhatsApp, importa/exporta dados via CSV e ignora regras do prazo de 72 horas.

> [!NOTE]  
> Usuários gestores visualizam um **Alternador de Perfil** no cabeçalho. Você pode mudar para o modo "Operador" para auditar a interface sob a perspectiva de um colaborador comum.

---

## 📅 2. Criação e Gestão de Vagas de Apoio

Para cadastrar novas necessidades de apoio na escala de turnos:
1.  No painel administrativo (Modo Admin ativo), clique em **"Criar Vaga de Apoio"**.
2.  Preencha os campos solicitados:
    *   **Grupo de Apoio e Subgrupo (Atividade)**: Categoria da escala.
    *   **Horário/Turno**: Horário previsto para o apoio.
    *   **Áreas/Funções Necessárias**: Marque as áreas obrigatórias para que apenas operadores qualificados possam assumir a vaga.
    *   **Características Previstas**: Selecione as regras ($R_1$ a $R_{12}$) para cálculo automático da pontuação prevista.
    *   **Atribuição Direta (Opcional)**: Você pode escalar diretamente um operador para a vaga na criação. O sistema validará se ele atende às áreas necessárias e alertará se ele exceder o limite mensal de 3 apoios.
    *   **Motivo da Solicitação / Causa Raiz (Obrigatório)**: Selecione a causa da necessidade do apoio na lista suspensa padronizada (ex: "Licença Médica", "Composição de Turno", "Férias"). Esta informação é salva e integrada ao histórico, mas é omitida no template do WhatsApp.
3.  **Vagas Repetidas**: Use o configurador de recorrência para gerar vagas em lote (ex: repetir semanalmente por X semanas).

---

## ⚠️ 3. Controle do Limite Mensal (Autorizações)

Conforme as regras do sistema, os operadores têm o limite de 3 apoios confirmados por mês.
*   **Status Pendente**: Quando um operador tenta assumir o 4º apoio no mês, a vaga muda para o status **"Aguardando Aprovação Gerencial"**.
*   **Como Autorizar**: Acesse a escala e localize o cartão sinalizado em amarelo. Botões de **Aprovar (Autorizar)** e **Recusar (Rejeitar)** ficarão visíveis para a gestão.
*   **Efeito**:
    *   *Aprovar*: Confirma a atribuição do apoio e registra a identificação do gestor que deu a aprovação.
    *   *Recusar*: Libera o slot de escala de volta ao status "Livre" e limpa o lançamento correspondente no histórico.

---

## 🔄 4. Controle das Autotrocas

A aba **"Autotrocas"** (exclusiva para gestores) consolida o controle de folgas compensatórias:

### A. Aprovação de Folgas (Autotroca Normal)
*   Quando o operador assume uma escala sob regime de Autotroca, a folga solicitada por ele entra com status `PENDENTE_APROVACAO`.
*   O gestor deve avaliar a escala operacional da data pretendida e clicar em **"Aprovar"** ou **"Marcar como Gozada (Concluir)"** para efetivar a folga usufruída.

### B. Registro de Autotroca Contrária (Débito de Apoio)
Caso conceda uma folga antecipada a um operador:
1.  Na aba "Autotrocas", clique no botão **"Lançar Folga Antecipada (Débito)"**.
2.  Selecione o operador beneficiado e insira a data em que ele usufruirá da folga.
3.  O operador entrará automaticamente em status **"Em Débito de Apoio"**. O sistema forçará a quitação deste saldo devedor na próxima escala de apoio que ele assumir.

---

## 💬 5. Ferramentas de Comunicação e Penalidades

### Gerador de Relatório para WhatsApp
*   No painel administrativo, clique em **"Gerar Relatório para WhatsApp"**.
*   O sistema cria um texto formatado contendo:
    *   `🟢` (bola verde) para vagas com status **Livre** (exibindo explicitamente o texto `: Livre`).
    *   `🔴` (bola vermelha) para vagas **Atribuídas** (exibindo a identificação e o nome do colaborador).
    *   `⚪` (bola branca) para vagas com status **Cancelado**.
    *   Link de acesso direto da aplicação no rodapé.
*   Clique em "Copiar Relatório" para transferir o texto pronto para a área de transferência.

### Lançar Infração de WhatsApp (+0.01 pts)
*   Se um operador utilizar o grupo oficial de WhatsApp para assuntos não relacionados a escalas, clique em **"Lançar Infração de WhatsApp"** na barra de ações rápidas.
*   Selecione o operador e salve. O sistema acrescentará **+0.01 ponto** à classificação geral dele, reduzindo sua prioridade no ranking.

---

## 🔍 6. Auditoria de Apoios

Utilize a aba **"Auditoria"** para confrontar as atribuições da escala com os lançamentos efetuados no histórico:
*   O sistema cruza todas as vagas de escala (`slots`) ocupadas com os lançamentos de histórico (`history`) correspondentes.
*   Se o operador assumiu a vaga mas não a registrou no histórico no prazo de 72 horas, o status na auditoria exibirá **Não Lançado ⚠️**.
*   Você pode filtrar a auditoria por colaborador, status de lançamento e período de datas para localizar inconsistências rapidamente.
