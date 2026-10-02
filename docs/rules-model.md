# Modelo e limites das regras locais

O UID proprietário está no caminho. Não adicionamos papéis administrativos. O perfil público já existente permanece separado do perfil privado. As consultas usadas continuam sendo leitura do documento próprio, subcoleções próprias e leitura individual de recursos explicitamente compartilhados.

As regras revisadas são um protótipo local, não publicado. Alvos, saldos e exercícios são validados na criação e na atualização; resgates usam recibo e verificação getAfter. Testes do emulador devem verificar isolamento, tipos, ausência de campos, valores negativos, repetição e concorrência. Datas de rotina são datas de calendário do aparelho; as regras limitam seu formato/tamanho e o cliente valida a data real.

Limite desta revisão: dados legados inválidos não são apagados. Corrija-os em cópia após exportação, antes de aplicar regras mais restritas. Campos antigos do perfil fora dos itens deste pedido mantêm compatibilidade; não houve auditoria integral dos documentos de perfil ou da infraestrutura remota.

O campo de detalhes extras preserva a validação legada (lista de até 30 itens), evitando recusar metas existentes. O cliente e o importador validam pares k/v e seus comprimentos; a estrutura interna desse campo não foi endurecida nas regras, pois a validação expandida excedia o orçamento de expressões no limite legado. Essa é uma limitação conhecida da revisão, não uma validação integral do documento.
