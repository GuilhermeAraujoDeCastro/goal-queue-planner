# Web de Metas

Painel de metas financeiras com sequenciamento por prioridade: em vez de juntar dinheiro para todas as metas ao mesmo tempo, o sistema calcula em que mês cada meta começa, assumindo que elas são financiadas em ordem, uma de cada vez, pela prioridade definida.

Site: https://consiga-seus-objetivos.netlify.app

## Tecnologias

O front-end é JavaScript puro em módulos ES, sem framework, usando o SDK compat do Firebase (Authentication e Firestore) carregado por tags de script no HTML. Além disso:

- Chart.js para o gráfico de evolução do valor guardado em cada meta
- html2canvas para exportar o card de meta concluída como imagem
- Uma função serverless da Netlify que busca imagens na API oficial da Unsplash, mantendo a chave de acesso fora do navegador

O build de produção usa esbuild para empacotar os módulos em um único arquivo e javascript-obfuscator para ofuscar esse arquivo antes do deploy.

## Estrutura de pastas

```
web-metas/
├── index.html
├── build.js
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── firebase-config.js
│   ├── state.js
│   ├── ui.js
│   ├── auth.js
│   ├── goals.js
│   ├── images.js
│   ├── celebrate.js
│   └── chart.js
├── netlify/
│   └── functions/
│       └── unsplash-search.js
└── dist/            (gerado pelo build, não versionado)
```

## Build local

```
npm install
npm run build
```

O comando gera a pasta `dist/` com o HTML, o CSS e o JavaScript já empacotado e ofuscado. É essa pasta que a Netlify publica, conforme configurado em `netlify.toml`.

## Configuração necessária

A busca de imagens usava o endpoint `source.unsplash.com`, que a própria Unsplash desativou. A busca agora passa pela API oficial, o que exige uma variável de ambiente no painel da Netlify:

- `UNSPLASH_ACCESS_KEY`: um Access Key gerado em unsplash.com/developers, criando uma aplicação nova. O plano gratuito (Demo) libera 50 requisições por hora, o suficiente para uso pessoal.

Sem essa variável configurada, a busca de imagens mostra um aviso e as outras formas de adicionar imagem (URL direta ou upload) continuam funcionando normalmente.

## Sobre o sequenciamento por prioridade

Cada meta tem uma prioridade numérica (1 é a primeira a ser financiada). A meta de prioridade 1 usa o mês de início configurado nela mesma; a de prioridade 2 começa no mês em que a 1 termina, considerando o aporte mensal e o valor que falta, e assim sucessivamente.

Esse cálculo depende de cada prioridade ser única. Por isso o app recusa salvar uma meta com uma prioridade já usada por outra meta ativa, tanto ao criar quanto ao editar.

## Licença

Consulte o arquivo LICENSE. As bibliotecas de terceiros usadas neste projeto estão listadas em CREDITS.md.
