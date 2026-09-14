Atue como desenvolvedor Full Stack sênior especialista em Supabase, 
Figma Make e arquitetura de dados.

Voce precisa analisar toda a estrutura atual do painel 
Cooprata Supermercados, identificar todos os bugs e 
reformular o codigo completo.

## PROJETO
- Painel: supermercadoscooprata.figma.site (Figma Make)
- Backend: Supabase
- Origem dos dados: planilha Excel (.xlsx)

## BUGS CRITICOS RELATADOS (3 problemas)

### BUG 1 - Dados somem para todos os perfis ao sincronizar
Quando o usuario clica em "Sincronizar Dados", os dados 
desaparecem para TODOS os perfis simultaneamente:
- Desaparece para o perfil Editor
- Desaparece para o perfil de Visualizacao (somente leitura)
- Nao e um problema de um perfil so, afeta todos os usuarios 
  conectados ao mesmo tempo

Causa provavel: O estado dos dados esta sendo compartilhado 
globalmente em vez de ser isolado por perfil/usuario. Quando 
um usuario sincroniza, o estado global e limpo ou sobrescrito, 
afetando todas as sessoes ativas.

### BUG 2 - Upload da planilha nao persiste no Supabase
Mesmo clicando em "Subir Dados" e selecionando a planilha 
correta, os dados nao aparecem no painel. O fluxo atual:
1. Usuario clica em "Subir Dados"
2. Seleciona o arquivo .xlsx
3. O arquivo e processado (ou parece processar)
4. Mas os dados nao chegam ao Supabase OU chegam mas nao 
   sao persistidos corretamente
5. Ao clicar em "Sincronizar Dados", o painel fica vazio

Causa provavel: A funcao de Upsert nao esta funcionando 
corretamente, ou a RLS (Row Level Security) do Supabase 
esta bloqueando a escrita, ou os dados estao sendo enviados 
em formato incompativel com o schema da tabela.

### BUG 3 - Dados somem de todos os meses e indicadores
Quando os dados somem, eles somem COMPLETAMENTE:
- Somem todos os meses (jan/26, fev/26, mar/26, etc.)
- Somem todos os indicadores (Faturamento, Margem Bruta, etc.)
- O painel fica totalmente vazio, nao apenas um mes ou 
  um indicador isolado

Causa provavel: O estado usa uma unica lista/array para 
todos os periodos em vez de um dicionario/objeto separado 
por periodo. Quando um periodo e limpo ou falha, toda a 
lista e afetada.

## ESTRUTURA DA PLANILHA (para contexto do upload)

A planilha Excel tem a seguinte estrutura:

### Nome da aba: L1.26
- "L1" = Loja 1
- ".26" = ano 2026
- Outras abas possiveis: L2.26 (Loja 2), L3.26 (Loja 3)

### Linha 1 (celulas AMARELAS) = Datas
- Coluna A: vazia ou titulo
- Colunas B, C, D, E, F, G, H: meses (jan/26, fev/26, 
  mar/26, abr/26, mai/26, jun/26, jul/26)
- No Excel aparecem como datas: 2026-01-01, 2026-02-01, etc.

### Coluna A (celulas VERMELHAS) = Nomes dos indicadores
- Linhas 2 a 52: Faturamento, Ticket Medio, Margem Bruta, 
  Qtd Vendida, N de cupons, Giro do Estoque, Estoque Inicial, 
  Estoque Final, Estoque Medio, CMV L1, TRANSF L2, TRANSF L3, 
  CMV TOTAL, Impostos, % CMV no faturamento, PME, Produtos 
  com Estoque, Giro de Produtos, Sem Giro de Produtos, 
  Itens Vendidos /M2, Cesta Media, Check out, R$/check out, 
  R$/ funcionarios, Venda/M2, Descarte total, % descarte total, 
  Descarte de parcial, % descarte parcial, N Funcionarios, 
  Dispendios c/pessoal, % custo c/pessoal, Dispendios diretos, 
  % dispendios diretos, Dispendios indiretos, 
  % dispendios indiretos, Dispendios tributarios, 
  % dispendios triburarios, Dispendios financeiros, 
  % dispendios financeiros, Venda s/oferta, Part venda s/oferta, 
  Marg s/oferta, Venda c/oferta, Part venda c/oferta, 
  Marg c/oferta, M2 SUPERMERCADO, Lucro Bruto, Lucro Liquido, 
  Margem Liquida
- Total: 51 indicadores

### Area de dados (interseccao)
- B2:H52 = valores numericos
- Cada valor = um indicador em um mes especifico
- Celulas vazias = sem dados para aquele mes/indicador

### Mapa visual:

         A              B           C           D         ...  H
    +--------------+----------+----------+----------+---+----------+
  1 | (vazio)      | jan/26   | fev/26   | mar/26   |   | jul/26   |  AMARELO
    +--------------+----------+----------+----------+---+----------+
  2 | Faturamento  | 150000   | 155000   | 160000   |   | 180000   |  VERMELHO
  3 | Ticket Medio | 45.50    | 46.20    | 47.00    |   | 50.00    |
  4 | Margem Bruta | 30000    | 32000    | 35000    |   | 40000    |
    | ...          | ...      | ...      | ...      |   | ...      |
 52 | Margem Liquida| 5000    | 5200     | 5500     |   | 6000     |
    +--------------+----------+----------+----------+---+----------+

## ESTRUTURA DO PAINEL (UI)

### Header:
- Logo Cooprata Supermercados
- Abas: "Painel de Performance" e "Evolucao de Performance"
- Seletor de PERIODO: jan/26 a dez/26 (mes atual destacado)
- Botoes: "Sincronizar Dados", "Subir Dados", "Limpar"
- Botao de perfil: Editor / Admin / Visualizacao

### Area principal:
- Filtros: Oferta, Loja, Tipo Venda, Curva
- Grid de cards de indicadores (cada card tem: titulo, valor, 
  meta, YOY %)
- Botao "+ Novo Indicador"
- Legenda: Acima da meta (verde), Abaixo da meta (vermelho), 
  Neutro (azul)

### Perfis de usuario:
- Editor: pode subir dados, criar indicadores, editar, limpar
- Visualizacao: somente leitura, nao pode editar
- Admin: acesso total

## O QUE A IA DO FIGMA DEVE FAZER

### Passo 1: Analisar a estrutura atual
Antes de mudar qualquer coisa, analisar e reportar:
1. Como o estado dos dados esta estruturado hoje (variaveis, 
   context, store)
2. Como o upload da planilha funciona hoje (funcao, parsing, 
   envio ao Supabase)
3. Como a sincronizacao funciona hoje (query ao Supabase, 
   atualizacao do estado)
4. Como os perfis (Editor/Visualizacao) compartilham ou 
   isolam o estado
5. Como o seletor de periodo funciona hoje (se muda o estado 
   ou apenas filtra a view)
6. Como o botao Limpar funciona hoje

### Passo 2: Identificar as causas raiz dos 3 bugs
Para cada bug, explicar tecnicamente:
- Onde esta o erro no codigo atual
- Por que o erro ocorre
- Qual e a solucao

### Passo 3: Reformular a arquitetura de dados

A nova arquitetura DEVE seguir estes principios:

#### 3.1 - Isolamento por perfil
- Cada perfil (Editor, Visualizacao, Admin) deve ter seu 
  proprio estado de visualizacao
- Quando o Editor sincroniza, NAO deve afetar o perfil de 
  Visualizacao
- O perfil de Visualizacao deve apenas LER dados do Supabase, 
  nunca escrever
- O estado de UI (qual mes selecionado, quais filtros ativos) 
  deve ser local por sessao, nao global

#### 3.2 - Independencia por periodo
- Cada mes/periodo deve ter sua propria lista de indicadores
- Criar indicador em jan/26 NAO cria em fev/26
- Excluir indicador em mar/26 NAO exclui em abr/26
- Reordenar/redimensionar em um mes NAO afeta outros meses
- Trocar de mes no seletor deve carregar os indicadores 
  especificos daquele mes do Supabase

#### 3.3 - Persistencia correta no Supabase
- O upload deve fazer Upsert (inserir se nao existe, atualizar 
  se existe)
- A chave unica deve ser: store_id + period + indicator_name
- Apos o upload, os dados devem permanecer no Supabase mesmo 
  apos sincronizar
- A sincronizacao deve apenas LER do Supabase, nunca apagar

#### 3.4 - Botao Limpar
- Limpar deve afetar apenas o periodo atualmente selecionado
- Limpar deve remover indicadores E dados do periodo atual
- Limpar NAO deve afetar outros periodos
- Limpar deve ter confirmacao antes de executar
- Apos limpar, o estado local e o Supabase devem estar 
  consistentes

### Passo 4: Schema do Supabase

CREATE TABLE indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL,
  period TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  value NUMERIC,
  meta NUMERIC,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1,
  height INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, period, indicator_name)
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  selected_period TEXT,
  filters JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: qualquer usuario pode ler
-- Apenas Editor e Admin podem escrever
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read" ON indicators
  FOR SELECT USING (true);

CREATE POLICY "Editors can write" ON indicators
  FOR ALL USING (
    auth.role() IN ('editor', 'admin')
  ) WITH CHECK (
    auth.role() IN ('editor', 'admin')
  );

### Passo 5: Reformular o codigo

Fornecer o codigo completo para:

#### 5.1 - Funcao de upload da planilha
- Ler arquivo .xlsx
- Identificar abas (L1.26, L2.26, L3.26)
- Extrair store_id e ano do nome da aba
- Ler linha 1 para obter as datas (celulas amarelas)
- Ler coluna A para obter nomes dos indicadores (celulas vermelhas)
- Ler area de dados (interseccao)
- Para cada celula com valor numerico, criar registro:
  { store_id, period, indicator_name, value }
- Enviar ao Supabase via Upsert
- Mostrar progresso na UI
- Retornar sucesso com quantidade de registros enviados

#### 5.2 - Funcao de sincronizacao
- Buscar do Supabase os indicadores do periodo e loja selecionados
- Atualizar apenas o estado local da sessao atual
- NAO afetar outras sessoes ou perfis
- Mostrar loading durante a busca
- Se nao houver dados, exibir mensagem "Nenhum dado encontrado 
  para este periodo. Use Subir Dados para importar."
- Se houver erro, exibir mensagem de erro

#### 5.3 - Estado por sessao (nao global)
- Cada sessao de usuario tem seu proprio estado:
  { selectedPeriod, selectedStore, filters, indicators[] }
- O estado e carregado do Supabase ao entrar ou trocar periodo
- Alteracoes locais (selecionar mes, filtrar) nao afetam 
  outros usuarios
- Apenas operacoes de escrita (upload, criar, editar, excluir, 
  limpar) afetam o Supabase
- Mesmo as operacoes de escrita so afetam o periodo/loja 
  especificada

#### 5.4 - Botao Limpar
- Solicitar confirmacao: "Tem certeza que deseja limpar todos 
  os indicadores e dados de [mes selecionado]? Esta acao nao 
  pode ser desfeita."
- Apos confirmacao:
  - DELETE no Supabase WHERE store_id = X AND period = Y
  - Limpar estado local apenas do periodo atual
  - NAO afetar outros periodos
  - Exibir mensagem de sucesso

#### 5.5 - Criar/Excluir indicador
- Criar: inserir no Supabase com store_id, period e 
  indicator_name do contexto atual
- Excluir: DELETE no Supabase WHERE id = X (apenas o 
  indicador especifico do periodo especifico)
- NUNCA criar ou excluir em todos os periodos simultaneamente

### Passo 6: Prevencao de bugs

- Race condition: ao trocar de mes rapidamente, cancelar 
  requests anteriores com AbortController
- Estado de loading em todas as operacoes para evitar 
  acoes duplicadas
- Debounce no redimensionamento e arraste (salvar no 
  Supabase apenas apos terminar)
- Validacao de arquivo antes do upload (.xlsx, tamanho 
  maximo, aba com nome valido)
- Tratamento de erro em todas as chamadas ao Supabase 
  com feedback visual
- Log de erros no console para debug
- Sincronizacao automatica ao trocar de mes (buscar dados 
  do novo mes no Supabase)
- Nao usar estado global compartilhado entre sessoes - 
  cada sessao tem seu proprio estado local
- Verificar permissoes do usuario antes de operacoes de 
  escrita (apenas Editor/Admin)

### Passo 7: Checklist de testes

Apos implementar, testar cada item:

1. Subir planilha L1.26 e verificar se dados aparecem no 
   painel
2. Trocar de mes e verificar se dados daquele mes carregam
3. Criar indicador em jan/26 e verificar se NAO aparece 
   em fev/26
4. Excluir indicador em mar/26 e verificar se NAO some 
   em abr/26
5. Clicar em Sincronizar e verificar se dados permanecem
6. Abrir painel em outra sessao (perfil Visualizacao) e 
   verificar se os dados aparecem
7. Clicar em Limpar em jul/26 e verificar se apenas 
   jul/26 fica vazio
8. Verificar se apos Limpar, os outros meses continuam 
   com dados
9. Subir planilha novamente apos Limpar e verificar se 
   dados voltam
10. Trocar de mes rapidamente 5 vezes e verificar se 
    nao ocorre race condition

Forneça o codigo completo para todas as funcionalidades 
descritas acima, organizado por componente/funcao, com 
comentarios explicando cada parte.