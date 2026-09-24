// Proxy da API da Unsplash na Vercel (/api/unsplash-search). A chave fica só aqui,
// na variável UNSPLASH_ACCESS_KEY; o navegador nunca vê.

const UTM = 'utm_source=web-metas&utm_medium=referral';

// Só aceita avisar download pra própria API da Unsplash: antes qualquer URL recebia a chave no cabeçalho.
export function urlDeDownloadValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'api.unsplash.com' && u.pathname.includes('/download');
  } catch {
    return false;
  }
}

// Resposta da Unsplash -> só o que o app usa.
export function resumirFotos(data) {
  return (data.results || []).map((p) => ({
    thumb: p.urls.thumb,
    full: p.urls.regular,
    authorName: p.user.name,
    authorLink: `${p.user.links.html}?${UTM}`,
    downloadLocation: p.links.download_location,
  }));
}

export default async function handler(req, res) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return res.status(500).json({ error: 'UNSPLASH_ACCESS_KEY não configurada na Vercel', code: 'missing_env' });
  }

  const { query, trackDownload } = req.query;

  if (trackDownload) {
    if (!urlDeDownloadValida(trackDownload)) return res.status(400).json({ error: 'URL de download inválida' });
    try {
      await fetch(trackDownload, { headers: { Authorization: `Client-ID ${accessKey}` } });
    } catch (err) {
      console.error('Erro ao registrar download na Unsplash:', err);
    }
    return res.status(200).json({ ok: true });
  }

  if (!query || String(query).length > 80) {
    return res.status(400).json({ error: 'parâmetro query obrigatório (até 80 caracteres)' });
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=9`;
    const resposta = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
    const restantes = resposta.headers.get('x-ratelimit-remaining');

    // Plano gratuito da Unsplash: 50 buscas por hora. Avisa o app em vez de erro genérico.
    if (resposta.status === 403 || resposta.status === 429 || restantes === '0') {
      return res.status(429).json({ error: 'Limite de buscas da Unsplash atingido nesta hora.', code: 'rate_limited' });
    }
    if (!resposta.ok) {
      return res.status(502).json({ error: 'Unsplash respondeu ' + resposta.status });
    }

    const fotos = resumirFotos(await resposta.json());
    // A mesma busca fica 1 dia na borda da Vercel e não gasta a cota de novo.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ photos: fotos, remaining: restantes === null ? null : Number(restantes) });
  } catch (err) {
    console.error('Erro na busca da Unsplash:', err);
    return res.status(502).json({ error: 'Falha ao buscar imagens' });
  }
}
