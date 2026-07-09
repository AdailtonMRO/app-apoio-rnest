import { firebaseConfig } from './firebase-config.js';

// Verifica se as credenciais do Firebase foram preenchidas
export const isFirebaseEnabled = !!(
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  firebaseConfig.projectId.trim() !== ""
);

let firebaseApp = null;
export let auth = null;
export let db = null;
let googleProvider = null;
let messaging = null;
let getTokenFn = null;

// Importações dos módulos do Firebase via CDN
let signInWithPopupFn = null;
let signOutFn = null;
let onAuthStateChangedFn = null;
let docFn = null;
let updateDocFn = null;
let getDocFn = null;
let onSnapshotFn = null;
let setDocFn = null;

if (isFirebaseEnabled) {
  try {
    // Importações dinâmicas via ES Modules
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    const { getFirestore, doc, updateDoc, getDoc, onSnapshot, setDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    googleProvider = new GoogleAuthProvider();

    signInWithPopupFn = signInWithPopup;
    signOutFn = signOut;
    onAuthStateChangedFn = onAuthStateChanged;
    docFn = doc;
    updateDocFn = updateDoc;
    getDocFn = getDoc;
    onSnapshotFn = onSnapshot;
    setDocFn = setDoc;

    console.log("🔥 Firebase inicializado com sucesso!");

    // Inicialização dinâmica do Firebase Messaging (Push)
    try {
      const { getMessaging, getToken, isSupported } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js');
      const supported = await isSupported();
      if (supported) {
        messaging = getMessaging(firebaseApp);
        getTokenFn = getToken;
        console.log("🔔 Firebase Messaging (Push) inicializado com sucesso!");
      } else {
        console.warn("🔔 Firebase Messaging não é suportado neste navegador.");
      }
    } catch (msgErr) {
      console.warn("Aviso: Falha ao carregar Firebase Messaging SDK.", msgErr);
    }
  } catch (error) {
    console.error("Erro ao inicializar Firebase:", error);
    throw error;
  }
} else {
  console.error("❌ ERRO CRÍTICO: Firebase não configurado ou chaves em branco! O sistema requer conexão online obrigatória.");
}

// --- MÉTODOS DE AUTENTICAÇÃO ---

export async function loginWithGoogle() {
  if (!isFirebaseEnabled || !auth) {
    throw new Error("Autenticação indisponível: Firebase não habilitado.");
  }
  try {
    const result = await signInWithPopupFn(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Erro no login com Google:", error);
    throw error;
  }
}

export async function logout() {
  if (!isFirebaseEnabled || !auth) return;
  try {
    await signOutFn(auth);
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
  }
}

export function onAuthChange(callback) {
  if (!isFirebaseEnabled || !auth) {
    return () => {};
  }
  return onAuthStateChangedFn(auth, callback);
}

// --- MÉTODOS DE BANCO DE DADOS (FIRESTORE) ---

// Obtém o ID da organização a partir do parâmetro 'org' na URL (ex: ?org=transpetro)
// Caso não esteja presente, assume 'rnest' por padrão (retrocompatibilidade)
const urlParams = new URLSearchParams(window.location.search);
export const orgId = urlParams.get('org') || 'rnest';

// Função auxiliar para obter o caminho correto do documento para a organização ativa
function getDocPath(docName) {
  if (orgId === 'rnest') {
    // Para manter compatibilidade com a base de produção atual da RNEST
    return `rnest_database/${docName}`;
  } else {
    // Para novas organizações, usamos a estrutura multi-tenant isolada sob organizations/
    return `organizations/${orgId}/database/${docName}`;
  }
}

/**
 * Escuta mudanças em tempo real em um documento da coleção e aciona o callback.
 * Se o documento não existir no Firestore, inicializa-o automaticamente com os dados padrão.
 */
export function syncDocument(docName, defaultData, callback) {
  if (!isFirebaseEnabled || !db) {
    console.error(`Falha ao sincronizar documento '${docName}': Firebase não conectado.`);
    return () => {};
  }

  const docPath = getDocPath(docName);
  const docRef = docFn(db, docPath);

  return onSnapshotFn(docRef, async (snapshot) => {
    if (snapshot.exists()) {
      const payload = snapshot.data();
      if (payload && payload.data !== undefined) {
        callback(payload.data);
      } else {
        console.error(`❌ ERRO CRÍTICO: O campo 'data' no documento '${docName}' está ausente no Firestore!`);
        if (typeof window.showFatalError === 'function') {
          window.showFatalError(
            "Erro Crítico de Estrutura de Banco de Dados",
            `O documento '${docPath}' existe no Firestore, mas a chave 'data' está ausente ou corrompida. Para segurança dos dados, a gravação foi bloqueada.`
          );
        }
      }
    } else {
      console.warn(`⚠️ Documento '${docPath}' não encontrado no Firestore. Retornando estrutura vazia/padrão localmente.`);
      // NUNCA escrevemos dados padrão automaticamente no Firestore para evitar sobreposição acidental ou resets indesejados.
      let fallbackData = [];
      if (docName === 'config') {
        fallbackData = defaultData; // usa DEFAULT_CONFIG local
      } else if (docName === 'candidatos') {
        fallbackData = {};
      } else if (docName === 'groups') {
        fallbackData = defaultData; // usa INITIAL_GROUPS local
      }
      callback(fallbackData);
    }
  }, (error) => {
    console.error(`Erro ao escutar o documento ${docName} em ${docPath}:`, error);
    if (typeof window.showFatalError === 'function') {
      window.showFatalError(
        "Erro de Conexão com o Banco de Dados",
        `Erro de conexão/permissão ao escutar '${docPath}': ${error.message || error}`
      );
    }
  });
}

/**
 * Atualiza os dados de um documento existente no Firestore.
 */
export async function updateDocument(docName, dataArrayOrObj) {
  if (!isFirebaseEnabled || !db) {
    console.error(`Erro ao gravar documento '${docName}': Firebase não conectado.`);
    throw new Error("Sem conexão com o Firebase.");
  }

  const docPath = getDocPath(docName);
  const docRef = docFn(db, docPath);
  try {
    // Usamos setDocFn em vez de updateDocFn para garantir que o documento seja criado se não existir,
    // eliminando qualquer necessidade de pré-inicialização do banco de dados na nuvem com dados padrão fictícios.
    if (setDocFn) {
      await setDocFn(docRef, { data: dataArrayOrObj });
    } else {
      await updateDocFn(docRef, { data: dataArrayOrObj });
    }
  } catch (error) {
    console.error(`Erro ao gravar o documento ${docName} no Firestore em ${docPath}:`, error);
    throw error;
  }
}

/**
 * Solicita permissão para notificações e obtém o Token FCM do dispositivo.
 */
export async function getNotificationToken() {
  if (!isFirebaseEnabled || !messaging || !getTokenFn) {
    console.warn("FCM Push não está disponível ou não é suportado neste dispositivo.");
    return null;
  }

  const vapidKey = firebaseConfig.vapidKey;
  if (!vapidKey || vapidKey.trim() === "" || vapidKey === "SEU_VAPID_KEY_AQUI") {
    console.warn("Chave VAPID não configurada no firebase-config.js. Ignorando obtenção de token.");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      const currentToken = await getTokenFn(messaging, {
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration
      });
      return currentToken;
    } else {
      console.warn("Permissão de notificação negada pelo usuário.");
      return null;
    }
  } catch (error) {
    console.error("Erro ao obter token do FCM:", error);
    return null;
  }
}
