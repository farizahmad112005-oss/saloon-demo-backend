# velour-backend

API server for the Velour Men's Hair Salon booking system (Express + MySQL + Socket.IO).

## Setup

```bash
npm install
cp .env.example .env
# Fill DB and R2 credentials in .env
npm run db:init
npm run dev
```

Schema and seed SQL live in `database/`.
