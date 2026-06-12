// Inicialização do Firebase (SDK compat, carregado via script tags no
// index.html antes deste módulo). As chaves abaixo são públicas por
// natureza: identificam o projeto, mas não concedem acesso a dados por
// si só. Quem protege os dados de verdade são as regras do Firestore
// (veja firestore.rules na raiz do projeto e o README).

const firebaseConfig = {
  apiKey: "AIzaSyDJ_BFKLNdzdmbtdbT4SfWXVCnTQ8MC0T0",
  authDomain: "web-metas-40842.firebaseapp.com",
  projectId: "web-metas-40842",
  storageBucket: "web-metas-40842.firebasestorage.app",
  messagingSenderId: "52337039380",
  appId: "1:52337039380:web:69345d5af457af7e9c2f01"
};

firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();
export const FieldValue = firebase.firestore.FieldValue;
