# AI Skills Diagnostic

Педагогтердің ЖИ-ді практикалық меңгеру деңгейін 5–10 минутта анықтап, оқу топтарына (1/2/3) автоматты бөлетін веб-сервис.
Веб-сервис практической диагностики AI-навыков педагогов с автоматическим распределением по учебным группам.

- Frontend: React + TypeScript + Vite (қазақша / русский, мобильді нұсқа)
- Backend: Supabase (PostgreSQL, Auth, Row Level Security) + Vercel Serverless Function (`api/admin.js`)
- Рөлдер: SUPER ADMIN, SCHOOL ADMIN, PARTICIPANT

**Толық нұсқаулық (іске қосу, мектеп қосу, диагностика, экспорт, резервтік көшірме): [НҰСҚАУЛЫҚ.md](НҰСҚАУЛЫҚ.md)**

## Құрылымы / Структура
```
supabase/schema.sql   дерекқор: кестелер, RLS, бағалау, топқа бөлу, статистика, демо деректер
api/admin.js          әкімші аккаунттарын басқару (service_role тек серверде)
src/pages/            педагог беттері: басты бет, диагностика, нәтиже, кіру, /setup
src/admin/            әкімші панелі: дашборд, мектептер, диагностикалар, нәтижелер, салыстыру, баптаулар
src/i18n.tsx          барлық интерфейс мәтіндері (kk / ru)
scripts/dev-api.mjs   жергілікті /api сервері
```
Запуск 2026
## Жергілікті іске қосу
```
npm install
cp .env.example .env.local
node scripts/dev-api.mjs & npm run dev
```
