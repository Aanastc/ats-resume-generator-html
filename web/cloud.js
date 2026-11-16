// =============================================================================
// Sincronização na nuvem (Firebase Auth + Firestore)
// Expõe window.cloud para o app.js (script clássico). Se o Firebase não carregar
// (offline, bloqueador), o app continua funcionando só com o armazenamento local.
//
// Estrutura no Firestore (tudo sob careerStudio/{uid}):
//   careerStudio/{uid}                    -> perfil (nome, e-mail, último acesso)
//   careerStudio/{uid}/data/resume        -> currículo base
//   careerStudio/{uid}/data/talent        -> status dos cadastros em sites de talentos
//   careerStudio/{uid}/jobs/{jobId}       -> acompanhamento de vagas (salva, candidatei, adaptei)
// =============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { firebaseConfig, OWNER_EMAILS, ROOT_COLLECTION } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "pt-BR"; // e-mails de verificação e recuperação de senha em português

// Mensagens de erro do Firebase Auth em português
const AUTH_ERRORS = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-password": "Informe a senha.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/email-already-in-use": "Já existe uma conta com este e-mail. Use “Entrar”.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "Não existe conta com este e-mail.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com a internet.",
  "auth/popup-blocked": "O navegador bloqueou a janela de login. Permita pop-ups para este site.",
  "auth/popup-closed-by-user": null, // a pessoa fechou a janela: não é erro
  "auth/cancelled-popup-request": null,
  "auth/unauthorized-domain": "Este endereço não está autorizado no Firebase (Authentication → Settings → Authorized domains).",
  "auth/operation-not-allowed": "Este método de login não está ativado no Firebase (Authentication → Sign-in method)."
};

function friendly(err) {
  if (err?.code in AUTH_ERRORS) {
    const msg = AUTH_ERRORS[err.code];
    return msg === null ? null : Object.assign(new Error(msg), { code: err.code });
  }
  return err;
}

async function wrap(fn) {
  try {
    return await fn();
  } catch (err) {
    const e = friendly(err);
    if (e) throw e;
    return null; // cancelado pela pessoa
  }
}
// Cache local do Firestore: funciona offline e sincroniza quando a conexão volta.
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

const listeners = new Set();
let currentUser = null;
let resolveReady;
const ready = new Promise((r) => (resolveReady = r));

const userRef = () => doc(db, ROOT_COLLECTION, currentUser.uid);
const dataRef = (name) => doc(db, ROOT_COLLECTION, currentUser.uid, "data", name);
const jobRef = (id) => doc(db, ROOT_COLLECTION, currentUser.uid, "jobs", safeId(id));
// IDs de documento não podem conter "/" nem passar de 1500 bytes
const safeId = (id) => encodeURIComponent(String(id)).slice(0, 400);

// Firestore não aceita undefined: limpa o objeto antes de gravar
const clean = (value) => JSON.parse(JSON.stringify(value ?? null));

function requireUser() {
  if (!currentUser) throw new Error("Faça login para sincronizar.");
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    // Registra o perfil (sem bloquear a interface se falhar)
    setDoc(userRef(), {
      name: user.displayName || "",
      email: user.email || "",
      last_seen_at: serverTimestamp()
    }, { merge: true }).catch((e) => console.warn("[cloud] perfil:", e.message));
  }
  resolveReady();
  listeners.forEach((fn) => fn(user));
});

window.cloud = {
  enabled: true,
  ready,
  get user() {
    if (!currentUser) return null;
    const email = (currentUser.email || "").toLowerCase();
    return {
      uid: currentUser.uid,
      name: currentUser.displayName || email.split("@")[0],
      email,
      photo: currentUser.photoURL,
      verified: currentUser.emailVerified,
      provider: currentUser.providerData[0]?.providerId || "password",
      isOwner: OWNER_EMAILS.includes(email)
    };
  },
  onAuthChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  signInWithGoogle: () =>
    wrap(async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return signInWithPopup(auth, provider);
    }),
  signInWithEmail: (email, password) => wrap(() => signInWithEmailAndPassword(auth, email.trim(), password)),
  signUp: (name, email, password) =>
    wrap(async () => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name?.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      sendEmailVerification(cred.user).catch(() => {}); // confirmação de e-mail (não bloqueia o uso)
      listeners.forEach((fn) => fn(cred.user)); // atualiza o nome exibido
      return cred;
    }),
  resetPassword: (email) => wrap(() => sendPasswordResetEmail(auth, email.trim())),
  signOut: () => signOut(auth),

  // Documentos simples (currículo, cadastros)
  async load(name) {
    requireUser();
    const snap = await getDoc(dataRef(name));
    return snap.exists() ? snap.data() : null;
  },
  async save(name, payload) {
    requireUser();
    await setDoc(dataRef(name), { ...clean(payload), saved_at: serverTimestamp() });
  },
  watch(name, fn) {
    requireUser();
    return onSnapshot(dataRef(name), (snap) => fn(snap.exists() ? snap.data() : null, snap.metadata.hasPendingWrites));
  },

  // Acompanhamento de vagas
  async setJob(id, data) {
    requireUser();
    await setDoc(jobRef(id), { ...clean(data), job_id: String(id), updated_at: serverTimestamp() }, { merge: true });
  },
  async removeJob(id) {
    requireUser();
    await deleteDoc(jobRef(id));
  },
  watchJobs(fn) {
    requireUser();
    return onSnapshot(collection(db, ROOT_COLLECTION, currentUser.uid, "jobs"), (snap) => {
      const map = {};
      snap.forEach((d) => (map[d.data().job_id || decodeURIComponent(d.id)] = d.data()));
      fn(map);
    });
  }
};

window.dispatchEvent(new Event("cloud-ready"));
