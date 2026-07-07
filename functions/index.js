/**
 * Firebase Cloud Function (Node.js) para envio de Notificações Web Push.
 * 
 * Monitora o documento 'slots' da coleção 'rnest_database' no Firestore.
 * Quando uma nova vaga de apoio é adicionada, envia notificação push via FCM
 * para todos os dispositivos dos operadores registrados.
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.notifyNewSupportSlot = onDocumentUpdated("rnest_database/slots", async (event) => {
  const newValue = event.data.after.data();
  const oldValue = event.data.before.data();

  if (!newValue || !newValue.data) {
    console.log("⚠️ Documento sem campo 'data'. Ignorando.");
    return null;
  }

  const newSlots = newValue.data;
  const oldSlots = (oldValue && oldValue.data) ? oldValue.data : [];

  console.log(`📊 Vagas antes: ${oldSlots.length} | Vagas agora: ${newSlots.length}`);

  // 1. Detectar se novas vagas foram adicionadas
  if (newSlots.length <= oldSlots.length) {
    console.log("ℹ️ Nenhuma nova vaga adicionada. Atualização ignorada.");
    return null;
  }

  // Encontrar quais vagas são novas (não existiam na lista anterior por ID)
  const oldSlotIds = new Set(oldSlots.map(s => s.id));
  const addedSlots = newSlots.filter(s => !oldSlotIds.has(s.id));

  if (addedSlots.length === 0) {
    console.log("ℹ️ Nenhuma vaga inédita identificada por ID.");
    return null;
  }

  const newSlot = addedSlots[0];
  console.log(`🆕 Nova vaga detectada: "${newSlot.subgrupo}" em ${newSlot.data} | Horário: ${newSlot.horario}`);

  // 2. Buscar todos os tokens push dos usuários
  const db = admin.firestore();
  const usersDocRef = db.doc("rnest_database/users");
  const usersSnapshot = await usersDocRef.get();

  if (!usersSnapshot.exists) {
    console.log("❌ Documento 'users' não encontrado no Firestore.");
    return null;
  }

  const usersData = usersSnapshot.data();
  if (!usersData || !usersData.data) {
    console.log("❌ Campo 'data' ausente no documento de usuários.");
    return null;
  }

  // Extrair todos os tokens push de todos os usuários
  const allTokens = [];
  let usersWithTokens = 0;

  usersData.data.forEach(user => {
    if (user.pushTokens && Array.isArray(user.pushTokens) && user.pushTokens.length > 0) {
      usersWithTokens++;
      user.pushTokens.forEach(token => {
        if (token && !allTokens.includes(token)) {
          allTokens.push(token);
        }
      });
    }
  });

  console.log(`👥 Total de usuários: ${usersData.data.length} | Com tokens push: ${usersWithTokens} | Tokens únicos: ${allTokens.length}`);

  if (allTokens.length === 0) {
    console.log("⚠️ Nenhum token push registrado no banco de dados. Nenhuma notificação enviada.");
    return null;
  }

  // 3. Montar a mensagem FCM
  const message = {
    tokens: allTokens,
    notification: {
      title: "🚦 Solicitação de Apoio 🚦",
      body: `${newSlot.subgrupo} | ${newSlot.data} | Turno: ${newSlot.horario}`,
    },
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        icon: "https://adailtonmro.github.io/app-apoio-rnest/icon-192.png",
        badge: "https://adailtonmro.github.io/app-apoio-rnest/icon-192.png",
        vibrate: [200, 100, 200],
        requireInteraction: false,
      },
      fcmOptions: {
        link: "https://adailtonmro.github.io/app-apoio-rnest/"
      }
    }
  };

  // 4. Enviar via multicast
  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ FCM Multicast: ${response.successCount} enviados com sucesso, ${response.failureCount} falhas.`);

    // Limpeza de tokens inválidos/expirados
    if (response.failureCount > 0) {
      const tokensToRemove = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code || "desconhecido";
          console.warn(`  ⚠️ Token ${idx} falhou: ${code}`);
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(allTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`🧹 Limpando ${tokensToRemove.length} token(s) inválido(s)...`);
        const updatedUsers = usersData.data.map(user => {
          if (user.pushTokens && Array.isArray(user.pushTokens)) {
            return { ...user, pushTokens: user.pushTokens.filter(t => !tokensToRemove.includes(t)) };
          }
          return user;
        });
        await usersDocRef.set({ data: updatedUsers });
        console.log("✅ Tokens inválidos removidos do Firestore.");
      }
    }
  } catch (error) {
    console.error("❌ Erro no envio FCM Multicast:", error);
  }

  return null;
});
