# Cronograma Med Fullstack

Plataforma fullstack em Next.js 15 para cronograma de estudos, simulados, dashboard, caderno de erros, flashcards, cronômetro e produtividade.

## Stack

- Next.js 15 App Router + React + TypeScript
- TailwindCSS com dark mode real
- Prisma ORM + PostgreSQL
- NextAuth/Auth.js com credenciais e hash de senha
- Zod, React Hook Form, Zustand, Framer Motion, Lucide Icons
- Exportação PDF e Excel

## Como rodar localmente

```bash
pnpm install
cp .env.example .env
pnpm prisma:migrate
pnpm dev
```

Abra `http://localhost:3000`, crie uma conta e use a plataforma.

## Variáveis de ambiente

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/medboard?schema=public"
NEXTAUTH_SECRET="gere-um-segredo-com-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

## Estrutura

```text
app/                  Rotas App Router e API REST
components/           UI, views e providers
hooks/                Zustand store
lib/                  Auth, Prisma, validações e segurança
prisma/               Schema PostgreSQL
services/             Cliente HTTP
src-data/             Dados extraídos do HTML original
types/                Tipos TypeScript
utils/                Funções de cronograma e normalização
```

## Produção

1. Crie um banco PostgreSQL.
2. Configure `DATABASE_URL`, `NEXTAUTH_SECRET` e `NEXTAUTH_URL`.
3. Rode `pnpm prisma:migrate`.
4. Faça deploy na Vercel apontando para este repositório.

## Verificação

- `tsc --noEmit`: OK
- `next build`: OK

## Melhorias futuras

- WebSocket/SSE real para presença multi-dispositivo.
- Upload persistente de imagens no caderno de erros via storage.
- Relatórios PDF completos com paginação e identidade visual.
- Testes E2E com Playwright e pipeline CI.
