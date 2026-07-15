# Chrome Extension Licensing & Authentication System

Este é um sistema completo e pronto para produção de **autenticação, licenciamento e telemetria de dispositivos** projetado especificamente para extensões do Google Chrome. O sistema inclui um backend robusto em Express (Node.js) e um painel de administração (Web Admin Panel) construído em React com Tailwind CSS.

---

## 🚀 Funcionalidades Integradas

### 🔑 1. Autenticação de Usuários
- **Signup:** Cadastro seguro utilizando hash de senhas via `bcrypt`.
- **Login:** Autenticação de usuários retornando `access_token` JWT (expiração curta de 15 minutos) e `refresh_token` de longa duração.
- **Refresh:** Renovação automatizada do token de acesso utilizando o token de atualização.
- **Middleware de Segurança:** Proteção de rotas através de validação de tokens nos headers.

### 💳 2. Gerenciamento de Licenças (Chrome Extension)
- **Ativação (`/api/license/activate`):** Ativa uma chave de licença única vinculando-a ao e-mail do usuário e coletando a impressão digital do dispositivo (`fingerprint`).
- **Validação (`/api/license/validate`):** Valida em tempo de execução se uma licença é válida, monitorando expirações, limites máximos de dispositivos e suspensões.
- **Heartbeat (`/api/license/heartbeat`):** Telemetria automática que a extensão chama a cada 60s. Atualiza o status "online/offline" dos dispositivos, monitora se a licença ainda é válida e retorna mensagens push para o usuário.
- **Minha Licença (`/api/license/mine`):** Retorna as licenças ativas do usuário atualmente logado.

### 🛡️ 3. Painel Administrativo Web (React + Tailwind CSS)
- **Métricas Globais:** Visualização de total de usuários, licenças ativas, dispositivos online no momento e arquivos carregados.
- **CRUD de Usuários:** Listagem de contas de clientes com opções de bloqueio/desbloqueio e deleção com exclusão em cascata.
- **Gerenciador de Licenças:** Geração automática de chaves únicas, edição de status (Ativo, Suspenso), alteração do tipo de licença (Trial, Monthly, Lifetime), ajuste de limite de dispositivos (`max_devices`) e prorrogação de datas de expiração.
- **Monitor de Dispositivos e Logs de Atividade:** Gráfico e lista de dispositivos ativos e log de auditoria em tempo real para controle de fraudes.
- **Distribuição de Extensões & Versionamento:** Upload direto de arquivos ZIP de releases da extensão e verificação dinâmica de versão (`/api/extension/check-version`).
- **Notificações Push:** Disparo de mensagens push globais ou direcionadas para licenças específicas exibidas diretamente na extensão do usuário.

---

## 🛠️ Stack Tecnológica

- **Backend:** Node.js (Express, TypeScript, Esbuild, TSX)
- **Banco de Dados (Produção):** PostgreSQL (Script de migração em `/db_migration.sql`)
- **Banco de Dados (Desenvolvimento/Preview):** Engine JSON síncrona/assíncrona de alto desempenho em `/src/db.ts` (já pré-configurada e semeada com dados reais para testes rápidos).
- **Frontend Admin:** React 19, Tailwind CSS, Lucide Icons, Motion (Framer Motion).
- **Segurança:** Hashing `bcryptjs`, Assinatura `jsonwebtoken` (JWT), Rate Limiting, Filtros CORS customizáveis para ID de extensão do Chrome.

---

## 💻 Instruções de Instalação e Desenvolvimento Local

### 1. Clonar e Instalar as Dependências
Abra o diretório do projeto e execute:
```bash
npm install
```

### 2. Configurar as Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto (copie de `.env.example`):
```env
PORT=3000
JWT_SECRET=seu_segredo_super_secreto_jwt
JWT_REFRESH_SECRET=seu_outro_segredo_refresh
# URL base para downloads de arquivos e callbacks
APP_URL=http://localhost:3000
```

### 3. Executar em Modo de Desenvolvimento
O comando a seguir inicia o servidor Express integrado que serve tanto a API Rest quanto o compilador Vite em tempo de desenvolvimento:
```bash
npm run dev
```
O servidor estará acessível em: `http://localhost:3000`

---

## 🛢️ Integração com PostgreSQL (Produção)

Para mover o projeto do banco de dados em arquivo JSON local para o **PostgreSQL** em produção, siga estas etapas simples:

1. **Instale as dependências do banco de dados:**
   ```bash
   npm install pg @types/pg
   ```
2. **Execute o script de migração `/db_migration.sql`** em seu servidor de banco de dados PostgreSQL (por exemplo, Supabase, Neon, ou Cloud SQL).
3. **Adapte os métodos de acesso a dados em `/src/db.ts`** para realizar queries utilizando o driver `pg` instalado. Os métodos de CRUD criados mantêm as mesmas assinaturas e assinaturas de Promises, tornando a migração segura.

---

## ☁️ Instruções de Deploy em Produção

### Método 1: Container Docker (Recomendado para Google Cloud Run, AWS App Runner)

Este repositório já está configurado com um fluxo de compilação unificado ideal para containers sem estado:

1. **Compilar os ativos (Vite frontend + esbuild backend):**
   ```bash
   npm run build
   ```
   Isso produzirá a pasta estática `dist/` e o arquivo do servidor compilado em `dist/server.cjs`.

2. **Dockerfile sugerido para build de produção:**
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   EXPOSE 3000
   ENV NODE_ENV=production
   CMD ["npm", "start"]
   ```

3. **Executar o Container:**
   ```bash
   docker build -t extension-license-manager .
   docker run -p 3000:3000 --env-file .env extension-license-manager
   ```

---

## 🔌 Integração com sua Extensão do Chrome

No código JavaScript de background (`background.js` ou `service-worker.js`) ou popup da sua extensão Chrome, integre chamadas HTTP para os seguintes endpoints:

### A. Ativação da Licença (Popup de Boas-Vindas)
```javascript
fetch('https://sua-api.com/api/license/activate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'cliente@email.com',
    license_key: 'LIC-MONT-9999-9999',
    fingerprint: 'ID_UNICO_DO_COMPUTADOR_DO_CLIENTE',
    device_name: 'Computador Trabalho'
  })
})
.then(res => res.json())
.then(data => console.log('Licença Ativada:', data));
```

### B. Heartbeat Periódico (A cada 60 segundos)
Configure um alarme na extensão para manter o status online e ler notificações push pendentes:
```javascript
chrome.alarms.create('license-heartbeat', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'license-heartbeat') {
    fetch('https://sua-api.com/api/license/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: 'LIC-MONT-9999-9999',
        fingerprint: 'ID_UNICO_DO_COMPUTADOR_DO_CLIENTE'
      })
    })
    .then(res => res.json())
    .then(status => {
      if (!status.valid) {
        // Bloquear funcionalidades premium da extensão
        console.warn('Licença inválida ou expirada!', status.reason);
      } else {
        // Licença ok. Verificar notificações push:
        if (status.notifications && status.notifications.length > 0) {
          status.notifications.forEach(n => {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon.png',
              title: n.title,
              message: n.message
            });
          });
        }
      }
    });
  }
});
```
