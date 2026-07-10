/**
 * Firebase Cloud Function (Node.js) para envio de Notificações Web Push.
 * 
 * Este código monitora o documento 'slots' da coleção 'rnest_teu_ut_database' no Firestore.
 * Quando uma nova vaga de apoio é adicionada, a função localiza os tokens FCM
 * de todos os usuários no documento 'users' e envia o alerta em segundo plano.
 * 
 * Para implantar esta função no Firebase:
 * 1. Inicialize o Cloud Functions na pasta do seu projeto: firebase init functions
 * 2. Substitua o conteúdo de functions/index.js por este código.
 * 3. Faça o deploy: firebase deploy --only functions
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.notifyNewSupportSlot = onDocumentUpdated("rnest_teu_ut_database/slots", async (event) => {
  const newValue = event.data.after.data();
  const oldValue = event.data.before.data();

  if (!newValue || !newValue.data) return null;

  const newSlots = newValue.data;
  const oldSlots = (oldValue && oldValue.data) ? oldValue.data : [];

  // 1. Detectar se novas vagas foram adicionadas
  if (newSlots.length <= oldSlots.length) {
    console.log("Nenhuma nova vaga adicionada. Atualização ignorada.");
    return null;
  }

  // Encontrar quais vagas são novas (não existiam na lista anterior por ID)
  const oldSlotIds = new Set(oldSlots.map(s => s.id));
  const addedSlots = newSlots.filter(s => !oldSlotIds.has(s.id));

  if (addedSlots.length === 0) {
    console.log("Nenhuma vaga inédita identificada.");
    return null;
  }

  const newSlot = addedSlots[0]; // Notificar sobre a primeira nova vaga adicionada
  console.log(`Nova vaga detectada: ${newSlot.subgrupo} em ${newSlot.data}`);

  // 2. Buscar todos os tokens push dos usuários
  const db = admin.firestore();
  const usersDocRef = db.doc("rnest_teu_ut_database/users");
  const usersSnapshot = await usersDocRef.get();

  if (!usersSnapshot.exists()) {
    console.log("Documento de usuários não encontrado no Firestore.");
    return null;
  }

  const usersData = usersSnapshot.data();
  if (!usersData || !usersData.data) return null;

  // Extrair todos os tokens push de todos os usuários
  const allTokens = [];
  usersData.data.forEach(user => {
    if (user.pushTokens && Array.isArray(user.pushTokens)) {
      user.pushTokens.forEach(token => {
        if (token && !allTokens.includes(token)) {
          allTokens.push(token);
        }
      });
    }
  });

  if (allTokens.length === 0) {
    console.log("Nenhum token push registrado no banco de dados.");
    return null;
  }

  // 3. Montar a notificação push
  const payload = {
    notification: {
      title: "🚦 Solicitação de Apoio 🚦",
      body: `${newSlot.subgrupo} | Data: ${newSlot.data} | Horário: ${newSlot.horario}`,
    },
    // Parâmetros para PWA (Web Push)
    webpush: {
      headers: {
        Urgency: "high",
      },
      notification: {
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        click_action: "/", // Direciona ao site na raiz
        vibrate: [200, 100, 200]
      }
    }
  };

  // 4. Enviar mensagem via multicast (para múltiplos dispositivos de uma vez)
  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: allTokens,
      notification: payload.notification,
      webpush: payload.webpush
    });

    console.log(`Mensagens enviadas com sucesso! Sucessos: ${response.successCount}, Falhas: ${response.failureCount}`);

    // Limpeza de tokens inválidos/expirados (opcional, para manter o banco limpo)
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(allTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`Limpando ${tokensToRemove.length} tokens inválidos do Firestore...`);
        const updatedUsers = usersData.data.map(user => {
          if (user.pushTokens && Array.isArray(user.pushTokens)) {
            return {
              ...user,
              pushTokens: user.pushTokens.filter(t => !tokensToRemove.includes(t))
            };
          }
          return user;
        });
        await usersDocRef.set({ data: updatedUsers });
      }
    }
  } catch (error) {
    console.error("Erro geral no disparo do FCM Multicast:", error);
  }

  return null;
});
