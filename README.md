# FluxoCSV

Aplicação full stack para transformar arquivos CSV de vendas em relatórios prontos para decisão. O upload não bloqueia a interface: o arquivo é armazenado, enfileirado e processado por workers em segundo plano, com acompanhamento de status em tempo real.

<p>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/RabbitMQ-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white" alt="RabbitMQ" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/MinIO-C72E49?style=for-the-badge&logo=minio&logoColor=white" alt="MinIO" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

## Visão geral

O FluxoCSV resolve um cenário comum em produtos orientados a dados: o usuário precisa enviar um arquivo potencialmente grande, mas não deve esperar o processamento terminar para continuar usando a aplicação. A solução separa upload, processamento e geração de relatórios em etapas desacopladas.

Na prática, o usuário envia um CSV, acompanha o status do job e baixa um resumo consolidado em CSV ou um relatório visual em HTML ao final da execução.

## Arquitetura

```mermaid
flowchart LR
    U[Usuário] --> FE[Frontend React]
    FE -->|JWT + REST| API[API Gateway Fastify]
    FE -->|Upload por URL pré-assinada| MINIO[(MinIO)]
    API -->|Cria job| PG[(PostgreSQL)]
    API -->|Publica job| MQ{{RabbitMQ}}
    MQ --> W1[Worker 1]
    MQ --> W2[Worker 2]
    MQ --> WN[Worker N]
    W1 -->|Lê CSV e salva relatórios| MINIO
    W2 -->|Lê CSV e salva relatórios| MINIO
    WN -->|Lê CSV e salva relatórios| MINIO
    W1 -->|Status e métricas| PG
    W2 -->|Status e métricas| PG
    WN -->|Status e métricas| PG
    W1 -->|Progresso| REDIS[(Redis)]
    W2 -->|Progresso| REDIS
    WN -->|Progresso| REDIS
    REDIS -->|SSE| API
    API -->|Atualização em tempo real| FE
```

| Componente | Responsabilidade |
| --- | --- |
| **React + Vite** | Interface de autenticação, upload, acompanhamento de jobs e download de relatórios. |
| **Fastify** | API pública, autenticação JWT, URLs pré-assinadas, criação de jobs e canal SSE. |
| **RabbitMQ** | Desacopla a criação do job do processamento e mantém a fila de trabalho. |
| **Worker Node.js** | Consome jobs, valida o CSV, calcula indicadores e gera os relatórios. |
| **Redis** | Armazena e publica o progresso temporário de cada job. |
| **PostgreSQL + Prisma** | Persiste usuários, jobs, resultados agregados e metadados dos arquivos. |
| **MinIO** | Armazena o CSV original e os relatórios CSV/HTML gerados. |

## Fluxo de processamento

1. O frontend solicita à API uma URL pré-assinada para o arquivo CSV.
2. O navegador envia o arquivo diretamente ao MinIO, sem sobrecarregar a API.
3. Após o upload, a API cria um job no PostgreSQL e publica sua referência no RabbitMQ.
4. Um worker consome a mensagem, lê o arquivo, valida campos e calcula faturamento, ticket médio, quantidade de itens e ranking de produtos.
5. O worker publica o progresso no Redis e grava o resultado consolidado no PostgreSQL.
6. Os relatórios CSV e HTML são salvos no MinIO; o job passa para `completed` ou `failed`.
7. A API transmite os eventos de progresso ao frontend via Server-Sent Events (SSE), que então libera os downloads.

## Funcionalidades

- Cadastro e login com JWT.
- Jobs e relatórios isolados por usuário.
- Upload de arquivos CSV de até 100 MB por URL pré-assinada.
- Processamento assíncrono com fila RabbitMQ e worker independente.
- Progresso em tempo real com SSE.
- Validação de colunas e identificação de registros inválidos.
- Cálculo de faturamento total, ticket médio, itens vendidos e produtos mais rentáveis.
- Download de resumo em CSV e relatório visual em HTML.

## Como executar localmente

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) em execução.
- Portas `3003`, `5173`, `5432`, `5672`, `9000`, `9001` e `15672` disponíveis.

Na raiz do projeto, execute:

```bash
docker compose up --build
```

Depois, acesse `http://localhost:5173`, crie uma conta e envie um arquivo CSV. Para encerrar os serviços, use `docker compose down`.

### Escalonamento de workers

Por padrão, o ambiente inicia com **três workers**. Cada réplica recebe apenas um job por vez (`prefetch(1)`), o que evita que arquivos grandes concorram pela memória do mesmo processo.

Para definir uma capacidade padrão diferente, crie um arquivo `.env` na raiz do projeto:

```env
WORKER_REPLICAS=5
```

Em seguida, recrie o ambiente com `docker compose up -d --build`. Para ajustar a quantidade imediatamente, sem alterar o arquivo `.env`, use:

```bash
docker compose up -d --scale worker=5
```

Confira as réplicas ativas com `docker compose ps`. A fila e os consumidores podem ser acompanhados em `http://localhost:15672`, na seção **Queues and Streams**.

### Serviços locais

| Serviço | Endereço | Credenciais de desenvolvimento |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | Crie uma conta pela interface. |
| API | `http://localhost:3003/health` | — |
| MinIO Console | `http://localhost:9001` | `fluxocsv` / `fluxocsv_dev_secret` |
| RabbitMQ Management | `http://localhost:15672` | `fluxocsv` / `fluxocsv_dev` |
| PostgreSQL | `localhost:5432` | `fluxocsv` / `fluxocsv_dev` |

## Formato de CSV aceito

O arquivo deve conter uma coluna de produto e uma de valor. A quantidade é opcional. O parser aceita campos separados por vírgula ou ponto e vírgula, além de valores decimais nos formatos brasileiro e internacional.

```csv
produto,quantidade,valor
Caderno universitário,2,29.90
Caneta azul,4,9.50
```

| Tipo de dado | Nomes de coluna reconhecidos |
| --- | --- |
| Produto | `produto`, `product`, `item`, `descricao`, `nome` |
| Valor | `valor`, `preço`, `receita`, `venda`, `total`, `amount` |
| Quantidade (opcional) | `quantidade`, `qtd`, `quantity`, `unidades` |

Linhas sem produto ou com valor inválido/zero são ignoradas durante a agregação e contabilizadas no relatório de qualidade dos dados.

## Decisões técnicas

- **Upload direto ao storage:** URLs pré-assinadas evitam que arquivos grandes trafeguem pela API, reduzindo consumo de memória e facilitando escalabilidade horizontal.
- **Mensageria no processamento:** RabbitMQ permite que o upload responda rapidamente e que workers sejam escalados sem acoplamento ao frontend.
- **Estado transitório no Redis:** progresso é efêmero e publicado como evento; resultados permanentes ficam no PostgreSQL.
- **SSE para atualizações:** o caso de uso é unidirecional — servidor para cliente — e SSE reduz a complexidade operacional em comparação a WebSockets.
- **Relatórios no MinIO:** arquivos binários permanecem fora do banco relacional; o PostgreSQL mantém somente metadados e resultados analíticos.
- **Leitura incremental de CSV:** o worker consome o stream do MinIO em blocos, preservando campos entre blocos e evitando carregar o arquivo inteiro na memória.

## Próximos passos

- Adicionar testes de integração para o fluxo completo com infraestrutura real.
- Criar observabilidade com logs estruturados, métricas e tracing distribuído.
- Implantar autenticação por provedor externo e rotação de segredos fora do ambiente local.
- Evoluir o worker para leitura totalmente incremental de arquivos muito maiores.
- Disponibilizar relatório em PDF e filtros analíticos por período ou produto.
