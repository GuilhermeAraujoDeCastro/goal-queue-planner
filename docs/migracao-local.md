# Revisão de dados existentes

Trabalhe primeiro com exportação e emulador. Guarde o arquivo original e use contas fictícias. Nenhuma etapa desta revisão publica regras ou migra dados de produção.

## Web Metas

Metas sem status continuam ativas. Arquivar altera apenas estado, data e compartilhamento, preservando aportes. Os novos depósitos calculam saldo e acumulado em transação. Totais históricos antigos não são recalculados silenciosamente; compare deltas com o saldo inicial antes de corrigir qualquer divergência antiga.

O backup inclui arquivadas. Importe em conta fictícia e confira ordem, saldo, datas e valores. A prévia oferece manter atual, mesclar com escolha explícita ou criar cópia. Metas novas entram ao fim da fila em conta preenchida; em conta vazia, as prioridades são preservadas. Aportes ausentes do arquivo não são excluídos. Importações inválidas ou concorrentes são recusadas sem confirmação parcial. Máximo: 450 documentos por operação, 150 metas e 20 MB por arquivo.

