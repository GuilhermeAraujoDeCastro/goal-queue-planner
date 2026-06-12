// Proxy pra API oficial da Unsplash: busca de fotos e o aviso de download
// exigido pelas diretrizes da Unsplash. A chave de acesso fica só aqui
// (variável de ambiente UNSPLASH_ACCESS_KEY na Netlify), nunca chega ao
// navegador. O app antigo usava source.unsplash.com, que a própria
// Unsplash desativou, então a busca de imagens estava completamente fora
// do ar antes desta função existir.

const UTM = 'utm_source=web-metas&utm_medium=referral';

export default async (req) => {
  const url = new URL(req.url);
  const accessKey = Netlify.env.get('UNSPLASH_ACCESS_KEY');

  if (!accessKey) {
    return new Response(JSON.stringify({ error: 'UNSPLASH_ACCESS_KEY não configurada' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  const trackDownload = url.searchParams.get('trackDownload');
  if (trackDownload) {
    try {
      await fetch(trackDownload, {
        headers: { Authorization: `Client-ID ${accessKey}` }
      });
    } catch (err) {
      console.error('Erro ao registrar download na Unsplash:', err);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  const query = url.searchParams.get('query');
  if (!query) {
    return new Response(JSON.stringify({ error: 'parâmetro query obrigatório' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const apiUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=9`;
    const res = await fetch(apiUrl, { headers: { Authorization: `Client-ID ${accessKey}` } });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Unsplash respondeu ' + res.status }), {
        status: 502,
        headers: { 'content-type': 'application/json' }
      });
    }

    const data = await res.json();
    const photos = (data.results || []).map(p => ({
      thumb: p.urls.thumb,
      full: p.urls.regular,
      authorName: p.user.name,
      authorLink: `${p.user.links.html}?${UTM}`,
      downloadLocation: p.links.download_location
    }));

    return new Response(JSON.stringify({ photos }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    console.error('Erro na busca da Unsplash:', err);
    return new Response(JSON.stringify({ error: 'Falha ao buscar imagens' }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
};
