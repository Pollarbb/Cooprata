Atue como desenvolvedor Full Stack especialista em Supabase, 
Figma Make e processamento de planilhas Excel.

## Contexto do projeto
- Painel: supermercadoscooprata.figma.site (Figma Make)
- Backend: Supabase
- Origem dos dados: planilha Excel exportada pelo sistema interno

## Estrutura real da planilha (IMPORTANTE - leia com atencao)

A planilha contem UMA aba com o nome no formato "L1.26".

### Significado do nome da aba:
- "L1.26" = Loja 1, ano 2026
- "L2.26" = Loja 2, ano 2026
- "L3.26" = Loja 3, ano 2026
- O numero apos o "L" identifica a loja (1, 2 ou 3)
- O numero apos o ponto identifica o ano (.26 = 2026)

### Estrutura das celulas:

LINHA 1 (cabecalho - CELULAS AMARELAS):
- A coluna A da linha 1 esta vazia ou contem um titulo generico
- As colunas B, C, D, E, F, G, H, etc. da linha 1 contem as DATAS
- Cada data representa um mes: jan/26, fev/26, mar/26, abr/26, mai/26, jun/26, jul/26
- No Excel essas datas aparecem como valores de data (ex: 2026-01-01)
- Estas celulas tem fundo AMARELO

COLUNA A (nomes dos indicadores - CELULAS VERMELHAS):
- A coluna A, a partir da linha 2, contem o NOME de cada indicador
- Exemplos: Faturamento, Ticket Medio, Margem Bruta, Qtd Vendida,
  N de cupons, Giro do Estoque, Estoque Inicial, Estoque Final,
  Estoque Medio, CMV L1, TRANSF L2, TRANSF L3, CMV TOTAL, Impostos,
  % CMV no faturamento, PME, Produtos com Estoque, Giro de Produtos,
  Sem Giro de Produtos, Itens Vendidos /M2, Cesta Media, Check out,
  R$/check out, R$/ funcionarios, Venda/M2, Descarte total,
  % descarte total, Descarte de parcial, % descarte parcial,
  N Funcionarios, Dispendios c/pessoal, % custo c/pessoal,
  Dispendios diretos, % dispendios diretos, Dispendios indiretos,
  % dispendios indiretos, Dispendios tributarios,
  % dispendios triburarios, Dispendios financeiros,
  % dispendios financeiros, Venda s/oferta, Part venda s/oferta,
  Marg s/oferta, Venda c/oferta, Part venda c/oferta, Marg c/oferta,
  M2 SUPERMERCADO, Lucro Bruto, Lucro Liquido, Margem Liquida
- Sao 51 indicadores no total (linhas 2 a 52)
- Estas celulas tem fundo VERMELHO

AREA DE DADOS (interseccao):
- As celulas B2:H52 (aproximadamente) contem os VALORES numericos
- Cada valor corresponde a um indicador (linha) em um mes (coluna)
- Exemplo: B2 = valor do Faturamento em janeiro, C2 = valor do 
  Faturamento em fevereiro, etc.
- Estas celulas podem estar vazias quando nao ha dados preenchados

### Mapa visual da planilha:

         A              B           C           D         ...  H
    +--------------+----------+----------+----------+---+----------+
  1 | (vazio)      | jan/26   | fev/26   | mar/26   |   | jul/26   |  <- AMARELO (datas)
    +--------------+----------+----------+----------+---+----------+
  2 | Faturamento  | 150000   | 155000   | 160000   |   | 180000   |  <- VERMELHO (nome do indicador)
  3 | Ticket Medio | 45.50    | 46.20    | 47.00    |   | 50.00    |
  4 | Margem Bruta | 30000    | 32000    | 35000    |   | 40000    |
  5 | Qtd Vendida  | 3300     | 3360     | 3400     |   | 3600     |
    | ...          | ...      | ...      | ...      |   | ...      |
 52 | Margem Liquida| 5000    | 5200     | 5500     |   | 6000     |
    +--------------+----------+----------+----------+---+----------+

## O que o botao "Subir Dados" deve fazer

1. Aceitar upload de um arquivo .xlsx
2. Ler a aba do arquivo (nome no formato L{numero_loja}.{ano})
3. Extrair o numero da loja e o ano do nome da aba:
   - L1.26 -> store_id = "L1", year = 2026
   - L2.26 -> store_id = "L2", year = 2026
   - L3.26 -> store_id = "L3", year = 2026
4. Ler a LINHA 1 para obter as datas (celulas amarelas):
   - Coluna B = primeiro mes (ex: 2026-01-01 = janeiro)
   - Coluna C = segundo mes (ex: 2026-02-01 = fevereiro)
   - Continuar ate a ultima coluna com data preenchida
5. Ler a COLUNA A a partir da linha 2 para obter os nomes dos 
   indicadores (celulas vermelhas):
   - Cada celula vermelha = nome de um indicador
   - Continuar ate a ultima linha com nome preenchido
6. Para cada celula de dados (interseccao linha x coluna):
   - Se a celula tiver um valor numerico, criar um registro
   - Se a celula estiver vazia, pular (nao criar registro)
7. Formatar cada registro como:
   {
     store_id: "L1",        // extraido do nome da aba
     period: "2026-01",     // extraido da celula amarela (linha 1)
     indicator_name: "Faturamento",  // extraido da celula vermelha (coluna A)
     value: 150000          // extraido da celula de dados
   }
8. Enviar os registros para o Supabase via Upsert
9. Mostrar progresso do upload na UI
10. Ao finalizar, exibir mensagem de sucesso com a quantidade 
    de registros enviados

## Estrutura da tabela no Supabase

CREATE TABLE indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL,          -- "L1", "L2", "L3"
  period TEXT NOT NULL,            -- "2026-01", "2026-02", etc
  indicator_name TEXT NOT NULL,    -- "Faturamento", "Margem Bruta", etc
  value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, period, indicator_name)
);

## O que o botao "Sincronizar Dados" deve fazer

1. Ao clicar, buscar no Supabase todos os registros da loja e 
   periodo atualmente selecionados no topo do painel
2. Para cada registro retornado:
   - Encontrar o quadro do indicador correspondente na UI
   - Atualizar o valor exibido no quadro
   - Se o indicador nao existir como quadro, cria-lo automaticamente
3. Mostrar loading durante a sincronizacao
4. Ao finalizar, exibir mensagem de sucesso
5. Se ocorrer erro, exibir mensagem de erro com detalhes

## Tratamento de erros

- Arquivo nao e .xlsx: exibir "Por favor, selecione um arquivo 
  Excel (.xlsx)"
- Aba com nome fora do padrao "L{numero}.{ano}": exibir "Nome da 
  aba nao reconhecido. Esperado: L1.26, L2.26 ou L3.26"
- Celula amarela sem data valida: pular a coluna e logar aviso
- Celula vermelha sem nome: pular a linha e logar aviso
- Celula de dados com valor nao numerico: pular e logar aviso
- Erro de conexao com Supabase: exibir "Erro ao conectar com o 
  banco de dados. Verifique sua conexao e tente novamente"
- Timeout: exibir "Tempo limite excedido. Tente novamente com 
  um arquivo menor"

## Importante

- A leitura da planilha deve ser baseada na POSICAO das celulas 
  (linha 1 = datas, coluna A = nomes), nao em cores
- As cores (amarelo e vermelho) sao apenas referencia visual para 
  o usuario saber quais celulas preencher
- O script deve funcionar independente de a celula ter cor de 
  fundo ou nao
- Porem, se possivel, usar a cor de fundo como validacao adicional: 
  se uma celula amarela nao tiver data, alertar; se uma celula 
  vermelha nao tiver nome, alertar
- O upload deve processar todas as abas do arquivo, nao apenas a 
  primeira. Se o arquivo tiver L1.26, L2.26 e L3.26, processar 
  todas e enviar os registros de cada loja separadamente

Forneça o codigo completo para implementar todas as funcionalidades 
descritas acima, incluindo:
1. Funcao de leitura do Excel (parsing)
2. Funcao de extracao de store_id e period
3. Funcao de Upsert no Supabase
4. Componente de UI com botao de upload e progresso
5. Funcao de sincronizacao
6. Tratamento de erros completo