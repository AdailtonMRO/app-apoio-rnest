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
let setDocFn = null;
let getDocFn = null;
let onSnapshotFn = null;

if (isFirebaseEnabled) {
  try {
    // Importações dinâmicas via ES Modules
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    const { getFirestore, doc, setDoc, getDoc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    googleProvider = new GoogleAuthProvider();

    signInWithPopupFn = signInWithPopup;
    signOutFn = signOut;
    onAuthStateChangedFn = onAuthStateChanged;
    docFn = doc;
    setDocFn = setDoc;
    getDocFn = getDoc;
    onSnapshotFn = onSnapshot;

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

/**
 * Escuta mudanças em tempo real em um documento da coleção e aciona o callback.
 * Se o documento não existir, ele o cria (seed) apenas com estruturas vazias ou configurações essenciais.
 */
export function syncDocument(docName, defaultData, callback) {
  if (!isFirebaseEnabled || !db) {
    console.error(`Falha ao sincronizar documento '${docName}': Firebase não conectado.`);
    return () => {};
  }

  const docRef = docFn(db, 'rnest_database', docName);

  return onSnapshotFn(docRef, async (snapshot) => {
    if (snapshot.exists()) {
      const payload = snapshot.data();
      callback(payload.data);
    } else {
      console.error(`❌ ERRO CRÍTICO: O documento '${docName}' não existe no Firestore! A inicialização automática pelo cliente foi bloqueada para segurança dos dados de produção.`);
      // Fornece dados padrão em memória para evitar crashes na interface, mas sem realizar escritas no banco
      let initialData = (docName === 'users' || docName === 'groups') ? defaultData : (docName === 'candidatos' ? {} : []);
      callback(initialData);
    }
  }, (error) => {
    console.error(`Erro ao escutar o documento ${docName}:`, error);
  });
}

/**
 * Atualiza os dados de um documento no Firestore.
 */
export async function updateDocument(docName, dataArrayOrObj) {
  if (!isFirebaseEnabled || !db) {
    console.error(`Erro ao gravar documento '${docName}': Firebase não conectado.`);
    throw new Error("Sem conexão com o Firebase.");
  }

  const docRef = docFn(db, 'rnest_database', docName);
  try {
    await setDocFn(docRef, { data: dataArrayOrObj });
  } catch (error) {
    console.error(`Erro ao gravar o documento ${docName} no Firestore:`, error);
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
