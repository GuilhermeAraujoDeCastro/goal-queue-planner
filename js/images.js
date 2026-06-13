// Entrada de imagem da meta: URL direta, upload de arquivo, ou busca.
//
// A busca usava source.unsplash.com, um endpoint que não pedia API key
// mas que a própria Unsplash desativou (ficou fora do ar depois de 2024).
// A busca agora chama uma função serverless da Netlify
// (netlify/functions/unsplash-search.js), que fala com a API oficial da
// Unsplash usando uma chave guardada só no servidor. O navegador nunca
// vê essa chave.

import { showToast } from './ui.js';

export function switchImgTab(prefix, tab) {
  const scope = document.getElementById(`modal-${prefix}`);
  scope.querySelectorAll('.img-tab').forEach(btn => btn.classList.remove('active'));
  const map = { url: '🔗', upload: '📁', search: '🔍' };
  scope.querySelectorAll('.img-tab').forEach(btn => {
    if (btn.textContent.trim().startsWith(map[tab])) btn.classList.add('active');
  });

  ['url', 'upload', 'search'].forEach(t => {
    const el = document.getElementById(`${prefix}-img-${t}-panel`);
    if (el) el.classList.toggle('active', t === tab);
  });
}

export function previewImg(prefix) {
  const url = document.getElementById(`${prefix}-img-url`).value.trim();
  const box = document.getElementById(`${prefix}-img-preview`);
  const img = document.getElementById(`${prefix}-img-preview-img`);
  const fin = document.getElementById(`${prefix}-img-final`);

  if (url) {
    img.src = url;
    box.style.display = 'block';
    fin.value = url;
  } else {
    box.style.display = 'none';
    fin.value = '';
  }
}

// Redimensiona e recomprime a imagem antes de guardar: ela é salva em
// base64 dentro do próprio documento da meta no Firestore, que tem limite
// de 1MB. Um arquivo original de ~1MB (bem dentro do limite de upload
// antigo de 2MB) já passava desse limite sozinho em base64 (~33% maior),
// e a meta falhava ao salvar sem nenhuma pista de que o problema era o
// tamanho da imagem.
function comprimirImagem(file, maxDimensao = 800, qualidade = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimensao) { height *= maxDimensao / width; width = maxDimensao; }
      else if (height > maxDimensao) { width *= maxDimensao / height; height = maxDimensao; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Falha ao comprimir imagem')); return; }
        const outReader = new FileReader();
        outReader.onload = () => resolve(outReader.result);
        outReader.onerror = reject;
        outReader.readAsDataURL(blob);
      }, 'image/jpeg', qualidade);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function handleUpload(input, prefix) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast('Imagem muito grande (máximo 8MB)', 'error');
    return;
  }

  let dataUrl;
  try {
    dataUrl = await comprimirImagem(file);
  } catch (err) {
    console.error('Erro ao comprimir imagem:', err);
    showToast('Não foi possível processar essa imagem. Tente outra.', 'error');
    return;
  }

  const box = document.getElementById(`${prefix}-img-preview`);
  const img = document.getElementById(`${prefix}-img-preview-img`);
  const fin = document.getElementById(`${prefix}-img-final`);

  img.src = dataUrl;
  box.style.display = 'block';
  fin.value = dataUrl;

  const label = document.getElementById(`${prefix}-upload-area`);
  if (label) {
    const span = label.querySelector('.upload-text');
    if (span) span.textContent = file.name;
  }
}

export async function searchUnsplash(prefix) {
  const query = document.getElementById(`${prefix}-img-search-input`).value.trim();
  const results = document.getElementById(`${prefix}-img-results`);
  if (!query) { showToast('Digite algo para buscar', 'error'); return; }

  results.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Buscando...</div>';

  let photos;
  try {
    const res = await fetch(`/.netlify/functions/unsplash-search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    photos = data.photos || [];
  } catch (err) {
    console.error('Erro na busca de imagens:', err);
    results.innerHTML = '<div style="color:var(--danger);font-size:12px;padding:8px">Busca indisponível agora. Tente de novo mais tarde.</div>';
    return;
  }

  if (photos.length === 0) {
    results.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Nenhum resultado.</div>';
    return;
  }

  results.innerHTML = photos.map((p, i) => `
    <div class="img-result-item" data-photo='${JSON.stringify(p).replace(/'/g, '&#39;')}' onclick="pickSearchImg('${prefix}', this)">
      <img src="${p.thumb}" alt="Foto de ${p.authorName} no Unsplash" loading="lazy" />
      <a class="img-credit" href="${p.authorLink}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📷 ${p.authorName}</a>
    </div>`).join('');
}

export function pickSearchImg(prefix, el) {
  document.querySelectorAll(`#${prefix}-img-results .img-result-item`).forEach(i => i.classList.remove('picked'));
  el.classList.add('picked');

  const photo = JSON.parse(el.dataset.photo);
  const box = document.getElementById(`${prefix}-img-preview`);
  const img = document.getElementById(`${prefix}-img-preview-img`);
  const fin = document.getElementById(`${prefix}-img-final`);

  img.src = photo.full;
  box.style.display = 'block';
  fin.value = photo.full;

  // Aviso obrigatório da Unsplash de que a foto foi "baixada" (usada de
  // verdade, não só pré-visualizada). Isso conta pras estatísticas do
  // fotógrafo; se falhar, não bloqueia o uso da imagem.
  if (photo.downloadLocation) {
    fetch(`/.netlify/functions/unsplash-search?trackDownload=${encodeURIComponent(photo.downloadLocation)}`)
      .catch(() => {});
  }
}

export function removeImgPreview(prefix) {
  document.getElementById(`${prefix}-img-preview`).style.display = 'none';
  document.getElementById(`${prefix}-img-final`).value = '';
  document.getElementById(`${prefix}-img-url`).value = '';
  const res = document.getElementById(`${prefix}-img-results`);
  if (res) res.querySelectorAll('.img-result-item').forEach(i => i.classList.remove('picked'));
}

export function getImgFinal(prefix) {
  return document.getElementById(`${prefix}-img-final`).value.trim();
}

window.switchImgTab = switchImgTab;
window.previewImg = previewImg;
window.handleUpload = handleUpload;
window.searchUnsplash = searchUnsplash;
window.pickSearchImg = pickSearchImg;
window.removeImgPreview = removeImgPreview;
