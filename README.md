# Aplicativo de Controle de Apoios - RNEST 🚦

Esta aplicação foi desenvolvida para gerenciar escalas e solicitações de apoios operacionais baseada no histórico de mensagens do grupo de WhatsApp da RNEST Abreu e Lima.

---

## 🚀 Como Executar o Aplicativo

Como o aplicativo utiliza módulos JavaScript nativos (ES6 Modules) para manter o código limpo, modular e sem necessidade de compilação, os navegadores exigem que ele seja aberto através de um servidor local simples (protocolo `http` em vez de abrir o arquivo local direto `file://`).

Você pode rodá-lo instantaneamente das seguintes formas:

### Opção A: Extensão "Live Server" do VS Code (Recomendada)
1. Abra a pasta `Preoejto App Apoio RNEST` no VS Code.
2. Instale a extensão **Live Server** (do criador Ritwick Dey).
3. Clique no botão **"Go Live"** no canto inferior direito do VS Code.
4. O navegador abrirá automaticamente a aplicação em `http://127.0.0.1:5500/`.

### Opção B: Servidor Python Integrado (Sem instalar nada)
Se você tem o Python instalado, abra o terminal na pasta do projeto e execute:
```bash
python -m http.server 8000
```
Depois abra [http://localhost:8000](http://localhost:8000) no seu navegador.

### Opção C: Usando o NPM (se disponível)
Se tiver o Node instalado:
```bash
npx http-server ./
```

---

## 🛠️ Arquitetura e Funcionalidades Implementadas

O aplicativo foi projetado com uma arquitetura **Vanilla Web App Premium** (HTML5 + CSS HSL + Vanilla JS ES6). Isso significa que:
1. **Sem travar no Google Drive**: Não há a pasta pesada `node_modules` nem arquivos de configuração complexos de compiladores que costumam ser bloqueados pelo sincronizador do Google Drive em computadores corporativos.
2. **Design Responsivo & Moderno**: Desenvolvido seguindo as melhores práticas visuais (modo escuro de alto contraste, glassmorphism, fontes Outfit/Inter e feedback por micro-animações), simulando o visual de um aplicativo móvel nativo.
3. **Fácil Portabilidade para Celular**: Os arquivos `index.html`, `style.css`, `app.js` e `data.js` podem ser diretamente encapsulados usando a biblioteca **Capacitor** para gerar instaladores nativos para **Android (APK)** e **iOS** sem alterações no código.

---

## 🎯 Principais Regras de Negócio Demonstradas

### 👥 Seletor de Perfis (Mock/Simulador)
No cabeçalho do aplicativo, você pode mudar o perfil ativo para experimentar o sistema sob diferentes perspectivas:
- **Apoiadores com diferentes pontuações**: Teste como o sistema responde dependendo de quantos apoios o colaborador já realizou.
- **Admin Operações**: Permite adicionar novas vagas de apoio e cancelar escalas.
- **Gerente Administrativo**: Painel especial para aprovar ou recusar solicitações em aberto.

### 📅 Escalas em Tempo Real
Os dados iniciais foram preenchidos exatamente com as informações e nomes das suas mensagens do WhatsApp (Yasmin, Adailton, Javã, Joelma, Syan, etc.), divididos pelas categorias (Grupo B, Apoio ADM, HA, etc.).

### ⚠️ Regra de Limite Mensal (> 3 apoios)
- Se um colaborador que já possui 3 apoios no mês tentar assumir uma vaga direta, o sistema avisa que a ação requer autorização e muda o status da vaga para **"Aguardando Aprovação Gerencial"**.
- Ao mudar o perfil para **Gerente**, botões de "Aprovar" e "Recusar" aparecem nestas vagas pendentes.

### 📊 Ranking de Prioridade (Google Sheets integrado)
- O painel exibe um ranking anual de colaboradores com base nos dados de apoios do ano corrente.
- **Substituição por Prioridade (Bumping)**: As vagas são de Acesso Direto. Caso um colaborador com menor prioridade (pontuação maior no ranking) assuma uma vaga, outro com maior prioridade (pontuação menor) pode clicar em "Substituir" para assumir o apoio correspondente, respeitando o regulamento de preferência. A antiga "Fila de Disputa" foi desativada.
- **Atribuição Direta por Admin**: Administradores podem selecionar e atribuir colaboradores diretamente às vagas na criação ou edição no painel administrativo.

### 💬 Gerador de Escala para WhatsApp
- Para administradores e gerentes, o botão **"Gerar Template WhatsApp"** cria o relatório textual formatado com emojis de status (`🟢` Livre, `🔴` Ocupada, `⚪` Cancelada) e link de acesso direto ao sistema, omitindo os motivos de solicitação internos dos administradores.
