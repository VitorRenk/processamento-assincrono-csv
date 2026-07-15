# FluxoCSV — processamento assíncrono

Aplicação local para enviar CSVs de vendas, processá-los em segundo plano e baixar relatórios. A arquitetura usa React, Fastify, RabbitMQ, Redis, PostgreSQL e MinIO.

## Executar

1. Instale Docker Desktop e mantenha-o aberto.
2. Na pasta do projeto, execute `docker compose up --build`.
3. Acesse `http://localhost:5173`, crie sua conta e envie um CSV.

Serviços auxiliares: API `http://localhost:3000/health`, MinIO Console `http://localhost:9001` e RabbitMQ `http://localhost:15672`. Credenciais locais para MinIO e RabbitMQ: usuário `fluxocsv`, senha `fluxocsv_dev` (MinIO: `fluxocsv_dev_secret`).

## Fluxo

O navegador solicita uma URL pré-assinada, envia o CSV diretamente ao MinIO e cria um job. A API publica o job no RabbitMQ; o worker o consome, armazena o progresso no Redis e cria os relatórios CSV/HTML no MinIO. Resultado e metadados ficam no PostgreSQL e o frontend recebe atualizações via SSE.

## CSV aceito

São obrigatórias colunas de produto (`produto`, `item`, `nome`) e valor (`valor`, `preço`, `receita`, `total`). A quantidade é opcional. Vírgula e ponto e vírgula são aceitos.
