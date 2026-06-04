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
  } catch (error) {
    console.error("Erro ao inicializar Firebase. Revertendo para modo offline (LocalStorage):", error);
  }
} else {
  console.log("ℹ️ Firebase não configurado ou chaves em branco. Usando modo de simulação local (LocalStorage).");
}

// --- MÉTODOS DE AUTENTICAÇÃO ---

export async function loginWithGoogle() {
  if (!isFirebaseEnabled || !auth) return null;
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
  if (!isFirebaseEnabled || !auth) return () => {};
  return onAuthStateChangedFn(auth, callback);
}

// --- MÉTODOS DE BANCO DE DADOS (FIRESTORE) ---

/**
 * Escuta mudanças em tempo real em um documento da coleção e aciona o callback.
 * Se o documento não existir, ele o cria (seed) com os dados iniciais.
 */
export function syncDocument(docName, defaultData, callback) {
  if (!isFirebaseEnabled || !db) {
    // Fallback: LocalStorage
    const local = localStorage.getItem(`rnest_law_${docName}_v5`);
    const data = local ? JSON.parse(local) : defaultData;
    callback(data);
    
    // Retorna uma função vazia para simular o unsubscribe
    return () => {};
  }

  const docRef = docFn(db, 'rnest_database', docName);

  return onSnapshotFn(docRef, async (snapshot) => {
    if (snapshot.exists()) {
      const payload = snapshot.data();
      callback(payload.data);
    } else {
      console.log(`Documento '${docName}' não encontrado no Firestore. Semeando com valores padrão...`);
      try {
        await setDocFn(docRef, { data: defaultData });
        callback(defaultData);
      } catch (err) {
        console.error(`Erro ao semear o documento ${docName}:`, err);
      }
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
    // Fallback: LocalStorage
    localStorage.setItem(`rnest_law_${docName}_v5`, JSON.stringify(dataArrayOrObj));
    return;
  }

  const docRef = docFn(db, 'rnest_database', docName);
  try {
    await setDocFn(docRef, { data: dataArrayOrObj });
  } catch (error) {
    console.error(`Erro ao gravar o documento ${docName} no Firestore:`, error);
    throw error;
  }
}
