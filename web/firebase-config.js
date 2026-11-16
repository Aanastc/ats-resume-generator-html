// Configuração pública do app web no Firebase (projeto exclusivo "jobs-3a608").
// Esses valores identificam o projeto e são públicos por natureza: quem protege os dados
// são as regras do Firestore (firestore.rules), que só deixam cada usuária ler e gravar o próprio espaço.
export const firebaseConfig = {
  apiKey: "AIzaSyBv81os-lb5XFFbEPS6e6aGAx6Gg2k6ITA",
  authDomain: "jobs-3a608.firebaseapp.com",
  projectId: "jobs-3a608",
  storageBucket: "jobs-3a608.firebasestorage.app",
  messagingSenderId: "605883552335",
  appId: "1:605883552335:web:98a944f4e4864cce84903a"
};

// Tudo deste app fica dentro desta coleção.
export const ROOT_COLLECTION = "careerStudio";

// E-mails da dona do app: só eles veem "Sincronizar portfólio" (que puxa o portfólio da Ana Letícia no GitHub).
// Se você entrar com outro e-mail, adicione-o aqui.
export const OWNER_EMAILS = [
  "aanastc20@gmail.com",
  "analeticia_ac@outlook.com",
  "ananovos@hotmail.com",
  "ana.claudiano@lingopass.com.br"
];
