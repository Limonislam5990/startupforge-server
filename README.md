# StartupForge — Server

Express and MongoDB API for StartupForge, a startup team builder where founders post roles and collaborators apply.

- **Client repository:** <https://github.com/Limonislam5990/startupforge-client>
- **Live API:** _add your live link here_

## Features

- JWT authentication: the token is read from an HTTPOnly cookie and checked by the `verifyToken` middleware, which also loads the user from the database so blocked users are stopped immediately
- Role based access (`founder`, `collaborator`, `admin`) with `verifyRole`
- Startups, opportunities and applications CRUD with ownership checks
- Search with MongoDB `$regex`, filters with `$in`, server-side pagination
- Free founders can post 3 opportunities, more needs the premium package (Stripe Checkout)
- Payment confirmation checks the session with Stripe and saves one transaction per payment
- Admin APIs: statistics, users (block and unblock), startups (approve and remove), transactions

## Main endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `GET /startups`, `GET /startups/:id` | public | Approved startups, details |
| `POST /startups`, `PATCH`/`DELETE /startups/:id` | founder | Manage own startup |
| `GET /opportunities` | public | Browse with `search`, `workType`, `industry`, `page`, `limit` |
| `GET /opportunities/filters`, `GET /opportunities/:id` | public | Filter options, details |
| `POST`/`PATCH`/`DELETE /opportunities` | founder | Manage own opportunities |
| `POST /applications` | collaborator | Apply (one application per opportunity) |
| `GET /applications/my` | collaborator | Own applications |
| `GET /applications/founder`, `PATCH /applications/:id/status` | founder | Review applications |
| `GET /stats/founder`, `GET /stats/collaborator` | founder, collaborator | Dashboard statistics |
| `GET /payments/status`, `POST /payments/create-checkout-session`, `POST /payments/confirm`, `GET /payments/my` | founder | Premium package |
| `GET /admin/stats`, `/admin/users`, `/admin/startups`, `/admin/transactions` | admin | Platform management |
| `GET /users/me`, `PATCH /users/me` | any user | Profile |

Register, login and logout are handled by Better Auth in the client project. The client also issues the JWT cookie.

## Environment variables

Create a `.env` file in the project root. Never commit it.

| Name | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name (defaults to `startupforge`, must match the client `MONGODB_DB`) |
| `JWT_SECRET` | Secret to verify the JWT (same as the client) |
| `CLIENT_URL` | Client origin(s) allowed by CORS, comma separated |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `PREMIUM_PRICE_USD` | Price of the premium package (defaults to 10) |
| `PORT` | Port (defaults to 5000) |

## Run locally

```bash
npm install
npm run dev
```

The API runs on <http://localhost:5000>. `GET /health` returns the status.

## Create an admin

Register a normal account in the client, then:

```bash
npm run make-admin -- your-email@example.com
```

## Deploy

`vercel.json` is included. Add the environment variables above in your Vercel project and set `CLIENT_URL` to the live client URL.
