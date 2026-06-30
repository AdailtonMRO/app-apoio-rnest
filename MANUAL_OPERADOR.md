# Manual do Usuário - Operador (Apoiador)
## Sistema de Apoios e Autotrocas RNEST

Este manual orienta você, operador da RNEST, sobre o funcionamento prático da aplicação de Apoios, com base nas regras estabelecidas pela **Lei Nº 0001/2025**. O objetivo do sistema é garantir transparência, democracia e justiça na distribuição de apoios de turno e folgas compensatórias.

---

## 📌 1. Entendendo o Ranking de Prioridade

O ranking de prioridade define quem tem o direito de assumir ou substituir (bumping) as vagas de apoio abertas no sistema.

*   **Menor Pontuação = Maior Prioridade**: Quanto menos pontos você acumulou ao longo do ano civil, mais no topo do ranking você estará e maior será sua prioridade para assumir escalas de apoio.
*   **Cálculo da Pontuação**: Cada apoio realizado possui características específicas ($R_1$ a $R_{12}$) com pesos definidos. A pontuação de cada apoio é calculada pelo produtório das características dividido por 10:
    $$\text{Pontuação} = \prod \left(\frac{\text{Peso de } R_i}{10}\right)$$
    *Exemplo*: Um apoio de Turno de 12 horas ($R_1$, peso 10) realizado em um Fim de Semana ($R_3$, peso 8) resulta em:
    $$(10/10) \times (8/10) = 0.8 \text{ pontos}$$
    *Nota*: Como as pontuações acumulam, fazer apoios "mais pesados" gera menor pontuação final, mantendo você em posição vantajosa no ranking.
*   **Critério de Desempate (Art. 8º)**: Havendo empate na pontuação geral, a prioridade será do operador que fez o último apoio em data mais antiga.
*   **Exclusões**: Colaboradores em funções com PHT administrativo definitivo (ex: GPI e OPMAN) não aparecem no ranking geral e não disputam prioridades de escala de turno.

---

## 📅 2. Como Assumir uma Vaga de Apoio

Na aba principal **"Todas as Escalas"** (ou selecionando o seu grupo de atuação), você visualiza os cartões de vagas abertas:

1.  **Compatibilidade de Área/Função**: O sistema só permite que você assuma vagas direcionadas às áreas e funções cadastradas no seu perfil (você pode verificar ou sugerir ajustes em "Editar Minhas Áreas/Funções").
2.  **Assumindo a Vaga**: Clique no botão **"Assumir Vaga"** em um cartão de vaga com status **Disponível (Livre)**.
3.  **Tipo de Lançamento**: No modal de confirmação, selecione:
    *   **Apoio Normal**: Se deseja trabalhar na folga e acumular a pontuação correspondente no ranking.
    *   **Autotroca**: Se deseja trabalhar no apoio em troca de uma folga futura (leia a Seção 4).
4.  **Limite de 3 Apoios por Mês**:
    *   Você pode assumir até 3 apoios por mês livremente.
    *   Ao tentar assumir o **4º apoio ou superior** no mesmo mês, o sistema deixará a vaga com status **"Aguardando Aprovação Gerencial"**. A vaga só será sua após um Supervisor ou Gerente autorizar o excesso.

---

## 🔄 3. Substituição por Prioridade (Bumping)

Se uma vaga de apoio futura já estiver ocupada por outro operador com **pontuação maior (menor prioridade)** que a sua no ranking, você verá o botão **"Substituir"**:

*   Ao clicar em "Substituir", o sistema valida instantaneamente o ranking.
*   Sendo confirmada a sua maior prioridade, o operador anterior é removido do slot e você assume a vaga.
*   O histórico de pontuação do operador substituído é automaticamente limpo ou recalculado pelo sistema de forma transparente.

---

## 🔀 4. O Sistema de Autotrocas

O sistema gerencia dois fluxos de autotrocra para equilibrar a relação trabalho-folga:

### A. Autotroca Normal (Apoio em troca de Folga Futura)
Quando você assume uma vaga de apoio sob regime de Autotroca:
1.  Você deve preencher a **"Data da Folga Pretendida"** no momento da confirmação.
2.  A vaga é registrada no sistema com sinalização de **🔄 Autotroca**.
3.  Esta solicitação de folga será auditada e aprovada pela supervisão.
4.  Você será pontuado normalmente pelo apoio realizado, recebendo os pontos correspondentes no ranking de classificação.

### B. Autotroca Contrária (Folga gozada gerando Débito de Apoio)
Se a supervisão conceder a você uma folga operacional antecipada (antes de você realizar um apoio):
1.  Você será registrado **"Em Débito de Apoio"** no sistema.
2.  Isso será exibido em seu widget **"Meu Painel"** e na aba **"Minhas Autotrocas"**.
3.  **Quitação Automática (Payback)**: Ao assumir qualquer vaga de apoio futura no sistema, o software identificará o débito pendente e forçará a operação como **"Quitação de Débito" (Payback 🔒)**.
4.  O apoio quitará o seu saldo devedor e você também pontuará normalmente pelo apoio realizado, acumulando os pontos no ranking.

---

## ⚠️ 5. Prazos e Penalidades Importantes

*   **Prazo de Registro (72 Horas)**: Todo apoio realizado deve ser conferido ou lançado no histórico no prazo limite de 72 horas.
*   **Penalidade R13**: Caso o lançamento ultrapasse o prazo de 72 horas após o término do apoio, o sistema aplica automaticamente a penalidade **R13 (peso 20 / multiplicador 2.0)**, o que aumenta consideravelmente seus pontos gerais e derruba sua prioridade no ranking.
*   **Grupo de WhatsApp**: Use o grupo apenas para fins profissionais de escala de apoio. Lançamentos indevidos geram multas administrativas de **+0.01 ponto** por ocorrência na sua classificação.
