# Prompt para recriar o ambiente em outro PC

Copie e cole este prompt para o Codex no outro computador, dentro da pasta do projeto.

```text
Voce esta em um novo PC e precisa deixar o projeto Nexa Wise funcionando em localhost exatamente como no PC anterior.

Contexto importante:
- O projeto e um app Next.js 16.2.6 com App Router, React 19, Prisma 7 e PostgreSQL.
- Antes de alterar codigo, leia `AGENTS.md` e leia o guia local do Next em `node_modules/next/dist/docs/01-app/index.md`, quando `node_modules` existir.
- Nao exponha chaves secretas no chat. Leia `.env` e `.env.local` apenas para validar nomes/formatos.
- O app principal roda em `http://localhost:3000`.
- A Evolution API roda em `http://localhost:8080`.
- O n8n roda em `http://localhost:5678`.
- O PostgreSQL do app roda via Docker na porta local `5434`.

Objetivo:
1. Instalar dependencias do projeto.
2. Subir Docker do PostgreSQL do app.
3. Subir Docker da Evolution API, Redis, PostgreSQL da Evolution, n8n e PostgreSQL do n8n.
4. Configurar `.env` e `.env.local`.
5. Rodar Prisma.
6. Validar build/lint.
7. Abrir tudo em localhost e confirmar que login, Evolution, QR Code, contatos, chat, grupos, campanhas e midias funcionam.

Checklist de pre-requisitos no PC:
- Docker Desktop instalado e aberto.
- Node.js LTS instalado.
- npm funcionando.
- Git instalado.
- Opcional para Stripe local: Stripe CLI.

Passo 1: instalar dependencias do projeto
Execute na raiz do projeto:

```powershell
npm install
```

Passo 2: configurar variaveis do app
Verifique se existem `.env` e `.env.local`. Se nao existirem, crie os dois com as mesmas chaves abaixo.
Para localhost, `.env.local` pode sobrescrever `.env`.

Variaveis esperadas:

```env
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=coloque_a_mesma_key_do_AUTHENTICATION_API_KEY_da_evolution
DATABASE_URL=postgresql://nexawise:nexawise_dev_password@localhost:5434/nexawise?schema=public
APP_URL=http://localhost:3000
AUTH_SECRET=gere_um_segredo_grande

RESEND_API_KEY=
RESEND_FROM_EMAIL=Nexa Wise <onboarding@resend.dev>

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_BASIC=
STRIPE_PRICE_PRO=
STRIPE_PRICE_MASTER=

BILLING_ALLOW_DEV_BYPASS=true
```

Observacoes:
- `AUTH_SECRET` pode ser gerado com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Para teste local, `BILLING_ALLOW_DEV_BYPASS=true` ajuda a criar conta sem depender 100% da assinatura Stripe.
- Se for usar Stripe de verdade em localhost, instale Stripe CLI e rode:
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  Depois copie o `whsec_...` para `STRIPE_WEBHOOK_SECRET`.
- No Google OAuth, o redirect precisa ser:
  `http://localhost:3000/api/auth/google/callback`
- No Resend, `RESEND_FROM_EMAIL` pode ficar `Nexa Wise <onboarding@resend.dev>` em teste, ou usar um dominio verificado.

Passo 3: subir PostgreSQL do app
O arquivo `docker-compose.auth.yml` deve ter este servico:
- container: `nexawise_postgres`
- banco: `nexawise`
- usuario: `nexawise`
- senha: `nexawise_dev_password`
- porta local: `5434`

Execute:

```powershell
docker compose -f docker-compose.auth.yml up -d
docker ps
```

Passo 4: rodar Prisma
Execute:

```powershell
npx prisma generate
npx prisma migrate deploy
```

Se for um banco local zerado e `migrate deploy` falhar por algum motivo de ambiente dev, tente:

```powershell
npx prisma migrate dev
```

Passo 5: subir Evolution API + n8n
Crie uma pasta fora do projeto, por exemplo:

```powershell
mkdir "$env:USERPROFILE\Desktop\Instalacao N8N Evolution"
cd "$env:USERPROFILE\Desktop\Instalacao N8N Evolution"
```

Crie um `docker-compose.yaml` para:
- `evo_postgres` com Postgres 16.
- `redis` com Redis 7.
- `evolution-api` com imagem `evoapicloud/evolution-api:v2.3.7`, porta `8080:8080`, usando `env_file: .env`.
- `postgres` do n8n com Postgres 16.
- `n8n` com imagem `n8nio/n8n:latest`, porta `5678:5678`.

Use este modelo:

```yaml
version: "3.9"

services:
  evo_postgres:
    image: postgres:16
    container_name: evo_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evo123
      POSTGRES_DB: evolution
    volumes:
      - evo_pg_data:/var/lib/postgresql/data

  postgres:
    image: postgres:16
    container_name: local_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: teste123
      POSTGRES_DB: n8n
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: local_redis
    restart: unless-stopped
    volumes:
      - redis_data:/data

  n8n:
    image: n8nio/n8n:latest
    container_name: local_n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      GENERIC_TIMEZONE: America/Sao_Paulo
      TZ: America/Sao_Paulo
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: teste123
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: teste123
      N8N_HOST: n8n
      N8N_PORT: 5678
      N8N_PROTOCOL: http
      WEBHOOK_URL: http://n8n:5678
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres

  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    container_name: local_evolution
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      - redis
      - evo_postgres

volumes:
  pg_data:
  evo_pg_data:
  redis_data:
  n8n_data:
  evolution_instances:
```

Crie o `.env` da Evolution na mesma pasta do `docker-compose.yaml`.
Valores principais que precisam existir:

```env
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=http://localhost:8080
CORS_ORIGIN=*
CORS_METHODS=GET,POST,PUT,DELETE
CORS_CREDENTIALS=true
LOG_LEVEL=ERROR
LOG_COLOR=true
LOG_BAILEYS=error
EVENT_EMITTER_MAX_LISTENERS=50

DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:evo123@evo_postgres:5432/evolution?schema=public
DATABASE_CONNECTION_CLIENT_NAME=evolution_exchange
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true
DATABASE_SAVE_IS_ON_WHATSAPP=true
DATABASE_SAVE_IS_ON_WHATSAPP_DAYS=7
DATABASE_DELETE_MESSAGE=true

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_TTL=604800
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=true

AUTHENTICATION_API_KEY=coloque_uma_key_grande_aqui
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=http://host.docker.internal:3000/api/webhooks/evolution
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
WEBHOOK_EVENTS_QRCODE_UPDATED=true
WEBHOOK_EVENTS_MESSAGES_SET=true
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_EDITED=true
WEBHOOK_EVENTS_MESSAGES_UPDATE=true
WEBHOOK_EVENTS_MESSAGES_DELETE=true
WEBHOOK_EVENTS_SEND_MESSAGE=true
WEBHOOK_EVENTS_CONTACTS_SET=true
WEBHOOK_EVENTS_CONTACTS_UPSERT=true
WEBHOOK_EVENTS_CONTACTS_UPDATE=true
WEBHOOK_EVENTS_PRESENCE_UPDATE=true
WEBHOOK_EVENTS_CHATS_SET=true
WEBHOOK_EVENTS_CHATS_UPSERT=true
WEBHOOK_EVENTS_CHATS_UPDATE=true
WEBHOOK_EVENTS_CHATS_DELETE=true
WEBHOOK_EVENTS_GROUPS_UPSERT=true
WEBHOOK_EVENTS_GROUPS_UPDATE=true
WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE=true
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_LABELS_EDIT=true
WEBHOOK_EVENTS_LABELS_ASSOCIATION=true
WEBHOOK_EVENTS_CALL=true
WEBHOOK_EVENTS_ERRORS=true
WEBHOOK_EVENTS_ERRORS_WEBHOOK=true

CONFIG_SESSION_PHONE_CLIENT=Nexa Wise
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=30
QRCODE_COLOR=#72d900
LANGUAGE=pt-BR

RABBITMQ_ENABLED=false
SQS_ENABLED=false
WEBSOCKET_ENABLED=false
PUSHER_ENABLED=false
TYPEBOT_ENABLED=false
CHATWOOT_ENABLED=false
OPENAI_ENABLED=false
DIFY_ENABLED=false
S3_ENABLED=false
```

Muito importante:
- A key de `AUTHENTICATION_API_KEY` da Evolution precisa ser exatamente igual ao `EVOLUTION_API_KEY` do app.
- `WEBHOOK_GLOBAL_URL` precisa ser `http://host.docker.internal:3000/api/webhooks/evolution`, porque a Evolution roda dentro do Docker e precisa chamar o app que roda no host.

Suba os containers:

```powershell
docker compose up -d
docker ps
```

Teste:
- Evolution Manager: `http://localhost:8080/manager/`
- n8n: `http://localhost:5678`
- App: `http://localhost:3000`

Passo 6: rodar o app
Na raiz do projeto:

```powershell
npm run dev
```

Passo 7: validar tudo
Execute:

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

Passo 8: testes funcionais obrigatorios
1. Abrir `http://localhost:3000/login`.
2. Criar conta com e-mail/OTP.
3. Entrar no app.
4. Ir em Configuracoes > WhatsApp.
5. Clicar em Conectar WhatsApp.
6. Criar uma instancia e ler o QR Code.
7. Confirmar no Evolution Manager que a instancia aparece conectada.
8. Confirmar no app:
   - contatos aparecem;
   - lista de conversas aparece;
   - mensagem enviada entra no chat imediatamente com reloginho;
   - mensagem recebida aparece em tempo real na lista e no chat;
   - notificacao aparece se a conversa nao estiver aberta;
   - grupos aparecem;
   - campanhas conseguem selecionar instancia/contatos/etiquetas.

Se as mensagens recebidas nao chegarem em tempo real:
1. Confira se o app esta rodando em `localhost:3000`.
2. Confira `WEBHOOK_GLOBAL_URL=http://host.docker.internal:3000/api/webhooks/evolution`.
3. Confira se `EVOLUTION_API_KEY` e `AUTHENTICATION_API_KEY` sao iguais.
4. Reinicie a Evolution:
   `docker restart local_evolution`
5. Veja logs:
   `docker logs -f local_evolution`

Se o Prisma nao conectar:
1. Confira se `nexawise_postgres` esta rodando.
2. Confira se `DATABASE_URL` usa porta `5434`, nao `5432`.
3. Rode:
   `docker logs nexawise_postgres`

Se quiser levar dados do PC antigo:
- Exportar/importar bancos e volumes Docker e mais trabalhoso.
- Para teste novo, o caminho mais simples e subir tudo limpo e conectar o WhatsApp de novo lendo o QR Code.
- Se precisar manter historico local, faca backup dos Postgres antigos antes de trocar de PC.

Ao final, me diga exatamente:
- quais containers estao rodando;
- se `npm run build` passou;
- se a Evolution abriu em `localhost:8080`;
- se o app abriu em `localhost:3000`;
- se o QR Code conectou uma instancia.
```
