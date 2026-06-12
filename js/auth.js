// Autenticação: login, cadastro, recuperação de senha e logout.

import { auth } from './firebase-config.js';
import { state } from './state.js';
import { showLoading, hideLoading, showToast, showScreen } from './ui.js';

function firebaseErrorMsg(code) {
  const msgs = {
    'auth/user-not-found': 'E-mail não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/weak-password': 'Senha muito fraca.',
    'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
    'auth/network-request-failed': 'Erro de conexão.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.'
  };
  return msgs[code] || 'Erro: ' + code;
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;

  if (!email || !pass) { showToast('Preencha todos os campos', 'error'); return; }

  showLoading();
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged cuida do redirect
  } catch (err) {
    hideLoading();
    showToast(firebaseErrorMsg(err.code), 'error');
  }
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;

  if (!name || !email || !pass) { showToast('Preencha todos os campos', 'error'); return; }
  if (pass.length < 8) { showToast('Senha deve ter no mínimo 8 caracteres', 'error'); return; }

  showLoading();
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    state.currentUser = cred.user;
    hideLoading();
    showToast('Conta criada com sucesso!', 'success');
  } catch (err) {
    hideLoading();
    showToast(firebaseErrorMsg(err.code), 'error');
  }
}

async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showToast('Informe seu e-mail', 'error'); return; }

  showLoading();
  try {
    await auth.sendPasswordResetEmail(email);
    hideLoading();
    showToast('Link de recuperação enviado para ' + email, 'success');
    setTimeout(() => showScreen('screen-login'), 2000);
  } catch (err) {
    hideLoading();
    showToast(firebaseErrorMsg(err.code), 'error');
  }
}

async function doLogout() {
  if (state.unsubscribeGoals) { state.unsubscribeGoals(); state.unsubscribeGoals = null; }
  await auth.signOut();
}

// onAuthenticated e onSignedOut são injetados pelo main.js pra evitar
// que este módulo dependa diretamente de goals.js.
export function initAuth(onAuthenticated, onSignedOut) {
  auth.onAuthStateChanged(user => {
    if (user) {
      state.currentUser = user;
      onAuthenticated(user);
    } else {
      state.currentUser = null;
      if (state.unsubscribeGoals) { state.unsubscribeGoals(); state.unsubscribeGoals = null; }
      onSignedOut();
    }
  });
}

window.doLogin = doLogin;
window.doRegister = doRegister;
window.doForgot = doForgot;
window.doLogout = doLogout;
