<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/RabbitMQ-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white" alt="RabbitMQ" />
  <img src="https://img.shields.io/badge/MinIO-C72E49?style=for-the-badge&logo=minio&logoColor=white" alt="MinIO" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

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
