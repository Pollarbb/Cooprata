Atue como desenvolvedor Full Stack sénior especialista em Figma Make, Supabase e visualização de dados.

Implemente o painel "Evolucao de Performance" do projeto Cooprata Supermercados. Este painel ja tem a aba criada no topo do site mas ainda nao tem conteudo. Ele deve consumir os mesmos dados do Supabase que o "Painel de Performance" e apresentar graficos animados, intuitivos e com modo tela cheia para exibicao em TV.

## CONTEXTO DO PROJETO

- Painel: supermercadoscooprata.figma.site (Figma Make)
- Backend: Supabase
- Tabela no Supabase: indicators (store_id, period_id, indicator_name, indicator_value, meta, position_x, position_y, width, height)
- O Painel de Performance ja esta funcionando e os dados ja estao sendo persistidos no Supabase
- A aba "Evolucao de Performance" ja existe no topo mas esta vazia
- Layout atual: tema escuro (fundo cinza escuro #1e1e1e), acentos em dourado/amarelo (#ffc107), cards arredondados, tipografia branca
- Seletor de periodo no topo: jan/26 a dez/26
- Filtros: Oferta, Loja, Tipo Venda, Curva
- Legenda: Acima da meta (verde), Abaixo da meta (vermelho), Neutro (azul)

## O QUE O PAINEL DEVE TER

### 1. GRAFICOS ANIMADOS COM OS DADOS DO SUPABASE

O painel deve buscar os dados da tabela indicators no Supabase e montar graficos animados. Usar ApexCharts ou Chart.js com animacoes fluidas (duracao minima de 1500ms na entrada).

#### Grafico 1 - Evolucao do Faturamento Mensal (Grafico de Linha)
- Eixo X: meses (jan/26, fev/26, mar/26, etc.)
- Eixo Y: valores em R$
- Duas linhas no mesmo grafico:
  - Linha 1: Faturamento Real (cor dourada #ffc107, linha suave com sombreado abaixo)
  - Linha 2: Meta de Faturamento (cor branca pontilhada)
- Animacao: a linha deve "desenhar" da esquerda para a direita ao carregar
- Tooltip ao passar o mouse mostrando o valor exato e a diferenca vs meta
- Se o faturamento estiver acima da meta, o ponto no grafica deve ser verde
- Se o faturamento estiver abaixo da meta, o ponto deve ser vermelho

#### Grafico 2 - Comparativo de Indicadores por Mes (Grafico de Barras Agrupadas)
- Eixo X: meses
- Eixo Y: valores
- Barras agrupadas lado a lado para os principais indicadores:
  - Faturamento, Margem Bruta, Lucro Bruto, Lucro Liquido
- Cada indicador com uma cor distinta mantendo a paleta do tema
- Animacao: as barras devem "crescer" de baixo para cima ao carregar
- Tooltip com valor exato de cada barra

#### Grafico 3 - Meta vs Realizado por Indicador (Grafico de Barras Horizontais)
- Eixo Y: nomes dos indicadores (Faturamento, Margem Bruta, Ticket Medio, Qtd Vendida, etc.)
- Eixo X: valores em R$ ou percentual
- Duas barras por indicador:
  - Barra 1: Valor Realizado (cor solida dourada)
  - Barra 2: Meta (cor mais suave/translucida)
- Se o realizado for maior ou igual a meta, a barra deve ficar verde
- Se o realizado for menor que a meta, a barra deve ficar vermelha
- Animacao: as barras devem "esticar" da esquerda para a direita

#### Grafico 4 - Indicadores em Destaque (Cards Animados com Numeros)
- Cards grandes no topo do painel mostrando os 4 indicadores principais:
  - Faturamento, Margem Bruta, Lucro Liquido, Ticket Medio
- Cada card mostra:
  - Nome do indicador
  - Valor atual (com animacao de contador regressivo: comeca em 0 e sobe ate o valor real)
  - Variacao percentual vs mes anterior (seta verde para cima, vermelha para baixo)
  - Mini grafico sparkline mostrando a tendencia dos ultimos 6 meses
- Os cards devem ter o mesmo estilo visual dos cards do Painel de Performance (arredondados, fundo escuro, borda sutil dourada)

#### Grafico 5 - Gauge de Metas (Velocimetro)
- 3 a 4 velocimetros circulares mostrando o percentual de atingimento da meta:
  - Faturamento: % atingido da meta
  - Margem Bruta: % atingido da meta
  - Lucro Liquido: % atingido da meta
- Cada gauge tem:
  - Arco colorido (verde se acima de 80%, amarelo entre 50-80%, vermelho abaixo de 50%)
  - Numero central grande mostrando o percentual
  - Nome do indicador abaixo
- Animacao: o arco deve "preencher" gradualmente de 0 ate o percentual real

### 2. SELETOR DE PERIODO E FILTROS

- O painel deve respeitar o mesmo seletor de periodo do topo (jan/26 a dez/26)
- Ao selecionar um mes, todos os graficos devem atualizar com os dados daquele mes
- Se o mes selecionado nao tiver dados, exibir mensagem: "Sem dados para este periodo. Suba os dados no Painel de Performance."
- Os filtros de Loja devem funcionar da mesma forma que no Painel de Performance
- Ao trocar de loja, todos os graficos devem recarregar com os dados da loja selecionada

### 3. MODO TELA CHEIA (FULLSCREEN)

- Adicionar um botao no canto superior direito do painel com icone de expandir
- Ao clicar, ativar o modo tela cheia usando a Fullscreen API do navegador:
  document.documentElement.requestFullscreen()
- Em tela cheia:
  - Esconder o header de navegacao, filtros e seletor de periodo
  - Mostrar apenas os graficos e cards ocupando toda a tela
  - Manter um botao flutuante no canto para sair da tela cheia (icone de comprimir)
  - O cursor do mouse deve ser escondido apos 5 segundos de inatividade (cursor: none)
  - Ao mover o mouse, o cursor e o botao de sair reaparecem
- O layout em tela cheia deve ser otimizado para TV (fontes maiores, graficos maiores, espacamento generoso)

### 4. MODO CARROSSEL (ROTACAO AUTOMATICA PARA TV)

- Em tela cheia, ativar automaticamente o modo carrossel:
  - A cada 30 segundos, alternar entre diferentes "telas" do painel:
    - Tela 1: Cards de destaque + Grafico de Linha do Faturamento
    - Tela 2: Grafico de Barras Agrupadas + Grafico de Barras Horizontais
    - Tela 3: Gauges de Metas + Grafico de Linha do Faturamento
    - Tela 4: Todos os graficos em grid (visao geral)
  - Transicao entre telas com fade suave (opacidade)
  - Um indicador discreto no canto inferior mostrando em qual tela esta (pontos: . . . .)
  - O carrossel so e ativado em tela cheia, nunca no modo normal
- Ao sair da tela cheia, o carrossel deve parar e voltar ao layout normal

### 5. AUTO-REFRESH DE DADOS

- A cada 60 segundos, buscar dados atualizados do Supabase em background
- Se houver dados novos (comparar timestamp updated_at), recarregar os graficos com animacao suave
- Nao recarregar a pagina inteira, apenas atualizar os dados dos graficos
- Mostrar um indicador discreto de "ultima atualizacao: hh:mm" no canto inferior

### 6. LAYOUT E ESTILO VISUAL

#### Cores (manter o tema atual do site):
- Fundo principal: #1e1e1e (cinza escuro)
- Fundo dos cards: #2a2a2a (cinza um pouco mais claro)
- Cor de acento primaria: #ffc107 (dourado/amarelo)
- Texto principal: #ffffff (branco)
- Texto secundario: #aaaaaa (cinza claro)
- Verde (acima da meta): #4caf50
- Vermelho (abaixo da meta): #f44336
- Azul (neutro): #2196f3

#### Tipografia:
- Titulos dos graficos: 18px, bold, branco
- Valores nos cards: 32px, bold, dourado
- Labels dos eixos: 12px, cinza claro
- Tooltips: 14px, branco com fundo escuro

#### Estrutura do layout (modo normal):
- Linha 1: 4 cards de destaque (Faturamento, Margem Bruta, Lucro Liquido, Ticket Medio)
- Linha 2: Grafico de Linha do Faturamento (largura total)
- Linha 3: 2 graficos lado a lado (Barras Agrupadas + Barras Horizontais)
- Linha 4: 3 a 4 Gauges de Metas centralizados

#### Estrutura do layout (modo tela cheia / TV):
- Otimizado para resolucao 1920x1080 ou superior
- Fontes 50% maiores
- Graficos ocupam o maximo de espaco possivel
- Sem scroll - tudo cabe em uma tela
- Transicoes suaves entre as telas do carrossel

### 7. INTEGRACAO COM O SUPABASE

#### Funcao de busca de dados:
- Buscar todos os indicadores do periodo e loja selecionados
- Ordenar por periodo_id crescente
- Para o grafico de linha, buscar dados de todos os meses disponiveis (jan/26 ate o mes atual)
- Para os cards de destaque, buscar apenas o mes atualmente selecionado
- Para o comparativo de metas, buscar valor e meta de cada indicador

#### Tratamento de dados ausentes:
- Se um indicador nao tiver meta definida, nao exibir a barra de meta (apenas o valor real)
- Se um mes nao tiver dados, pular o mes no grafico de linha (nao mostrar ponto)
- Se nenhum dado existir para a loja selecionada, exibir estado vazio com mensagem

### 8. DESEMPENHO

- Usar debounce ao trocar de mes ou loja para evitar multiplas requisicoes
- Cancelar requisicoes anteriores ao trocar de periodo (AbortController)
- Os graficos devem ser destruidos e recriados ao trocar de dados (Chart.js destroy() antes de new Chart())
- Usar requestAnimationFrame para as animacoes de contador nos cards

### 9. ACESSIBILIDADE E USABILIDADE

- Todos os graficos devem ter tooltips informativos
- Os graficos devem ser responsivos (redimensionar ao alterar o tamanho da janela)
- Em telas menores (mobile/tablet), os graficos devem empilhar verticalmente
- O botao de tela cheia deve ser visivel mas discreto

### 10. CHECKLIST DE TESTES

1. Abrir o painel e verificar se os 4 cards de destaque carregam com animacao de contador
2. Verificar se o grafico de linha desenha da esquerda para a direita
3. Verificar se as barras dos graficos crescem de baixo para cima
4. Verificar se os gauges preenchem gradualmente
5. Trocar de mes e verificar se todos os graficos atualizam
6. Trocar de loja e verificar se todos os graficos atualizam
7. Clicar no botao de tela cheia e verificar se o modo carrossel inicia
8. Esperar 30 segundos em tela cheia e verificar se a tela alterna com fade
9. Mover o mouse em tela cheia e verificar se o cursor e o botao de sair aparecem
10. Sair da tela cheia e verificar se o carrossel para
11. Verificar se o auto-refresh atualiza os dados a cada 60 segundos
12. Recarregar a pagina e verificar se os graficos carregam corretamente
13. Abrir em uma resolucao de TV (1920x1080) em tela cheia e verificar se tudo cabe sem scroll

Forneça o codigo completo para todas as funcionalidades descritas, organizado por componente, com comentarios explicando cada parte. Mantenha a mesma identidade visual do site atual.