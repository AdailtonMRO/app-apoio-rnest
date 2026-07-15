/**
 * Firebase Cloud Function (Node.js) para envio de Notificações Web Push.
 * 
 * Monitora o documento 'slots' da coleção 'rnest_teu_ut_database' no Firestore.
 * Quando uma nova vaga de apoio é adicionada, envia notificação push via FCM
 * para todos os dispositivos dos operadores registrados.
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.notifyNewSupportSlot = onDocumentUpdated("rnest_teu_ut_database/slots", async (event) => {
  const newValue = event.data.after.data();
  const oldValue = event.data.before.data();

  if (!newValue || !newValue.data) {
    console.log("⚠️ Documento sem campo 'data'. Ignorando.");
    return null;
  }

  const newSlots = newValue.data;
  const oldSlots = (oldValue && oldValue.data) ? oldValue.data : [];

  console.log(`📊 Vagas antes: ${oldSlots.length} | Vagas agora: ${newSlots.length}`);

  const db = admin.firestore();
  const usersDocRef = db.doc("rnest_teu_ut_database/users");
  let usersSnapshot = null;
  let usersData = null;

  // Função auxiliar para buscar usuários de forma preguiçosa (evita buscas redundantes)
  const getCachedUsers = async () => {
    if (!usersSnapshot) {
      usersSnapshot = await usersDocRef.get();
      if (usersSnapshot.exists) {
        usersData = usersSnapshot.data();
      }
    }
    return usersData;
  };

  // --- PARTE A: DETECTAR NOVAS VAGAS ADICIONADAS ---
  // Encontrar quais vagas são novas (não existiam na lista anterior por ID)
  const oldSlotIds = new Set(oldSlots.map(s => s.id));
  const addedSlots = newSlots.filter(s => !oldSlotIds.has(s.id));

  if (addedSlots.length > 0) {
    const newSlot = addedSlots[0];
    console.log(`🆕 Nova vaga detectada: "${newSlot.subgrupo}" em ${newSlot.data} | Horário: ${newSlot.horario}`);

    const uData = await getCachedUsers();
    if (uData && uData.data) {
      const allTokens = [];
      uData.data.forEach(user => {
        if (user.pushTokens && Array.isArray(user.pushTokens)) {
          user.pushTokens.forEach(token => {
            if (token && !allTokens.includes(token)) {
              allTokens.push(token);
            }
          });
        }
      });

      if (allTokens.length > 0) {
        const message = {
          tokens: allTokens,
          notification: {
            title: "🚦 Solicitação de Apoio 🚦",
            body: `${newSlot.subgrupo} | ${newSlot.data} | Turno: ${newSlot.horario}`,
          },
          webpush: {
            headers: { Urgency: "high" },
            notification: {
              icon: "https://app-apoio-rnest.web.app/icon-192.png",
              badge: "https://app-apoio-rnest.web.app/icon-192.png",
              vibrate: [200, 100, 200],
              requireInteraction: false,
            },
            fcmOptions: {
              link: "https://app-apoio-rnest.web.app/?org=rnest_teu_ut"
            }
          }
        };
        await sendFCMNotification(message, allTokens, usersDocRef, uData);
      }
    }
  }

  // --- PARTE B: DETECTAR SUBSTITUIÇÃO DE VAGA ---
  const substitutions = [];
  newSlots.forEach(newSlot => {
    const oldSlot = oldSlots.find(s => s.id === newSlot.id);
    if (oldSlot) {
      // Se a vaga já estava atribuída e agora foi reatribuída para outro operador
      if (
        oldSlot.usuarioId && 
        newSlot.usuarioId && 
        oldSlot.usuarioId !== newSlot.usuarioId && 
        newSlot.status === 'ATRIBUIDO'
      ) {
        substitutions.push({
          slot: newSlot,
          oldOwnerId: oldSlot.usuarioId
        });
      }
    }
  });

  if (substitutions.length > 0) {
    const uData = await getCachedUsers();
    if (uData && uData.data) {
      for (const sub of substitutions) {
        const oldUser = uData.data.find(u => u.id === sub.oldOwnerId);
        if (oldUser && oldUser.pushTokens && Array.isArray(oldUser.pushTokens) && oldUser.pushTokens.length > 0) {
          console.log(`👤 Enviando notificação de substituição para o usuário ${oldUser.nome} (ID: ${oldUser.id})`);
          
          const slotDateFormatted = sub.slot.data.split('-').reverse().join('/'); // Formata DD/MM/AAAA
          
          const message = {
            tokens: oldUser.pushTokens,
            notification: {
              title: "🚨 Vaga Substituída (Escala de Apoio)",
              body: `Você foi substituído na vaga de ${sub.slot.subgrupo} em ${slotDateFormatted} (${sub.slot.horario}) por outro operador com maior prioridade.`,
            },
            webpush: {
              headers: { Urgency: "high" },
              notification: {
                icon: "https://app-apoio-rnest.web.app/icon-192.png",
                badge: "https://app-apoio-rnest.web.app/icon-192.png",
                vibrate: [200, 100, 200],
                requireInteraction: true,
              },
              fcmOptions: {
                link: "https://app-apoio-rnest.web.app/?org=rnest_teu_ut"
              }
            }
          };
          await sendFCMNotification(message, oldUser.pushTokens, usersDocRef, uData);
        } else {
          console.log(`⚠️ Usuário substituído ${sub.oldOwnerId} não possui tokens push registrados ou não foi localizado.`);
        }
      }
    }
  }

  return null;
});

// Função auxiliar para envio e limpeza de tokens inválidos
async function sendFCMNotification(message, targetTokens, usersDocRef, uData) {
  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ FCM: ${response.successCount} enviados com sucesso, ${response.failureCount} falhas.`);

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
            tokensToRemove.push(targetTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`🧹 Limpando ${tokensToRemove.length} token(s) inválido(s)...`);
        const updatedUsers = uData.data.map(user => {
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
    console.error("❌ Erro no envio FCM:", error);
  }
}
