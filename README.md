# StartupForge — Server

REST API for **StartupForge**, a startup team builder platform where founders publish startups, post open roles and review applications, and collaborators browse opportunities and apply.

- **Live site:** _add your live client link here_
- **Live API:** _add your live server link here_
- **Client repository:** <https://github.com/Limonislam5990/startupforge-client>
- **Server repository:** <https://github.com/Limonislam5990/startupforge-server>

## Admin access (for evaluation)

| Email | Password |
|---|---|
| _admin email_ | _admin password_ |

## Tech stack

Node.js, Express 5, MongoDB (official driver), JSON Web Token, cookie-parser, CORS, Stripe, deployed on Vercel.

## Features

- **JWT authentication.** The token lives in an HTTPOnly cookie. The `verifyToken` middleware verifies it and loads the user from the database, so blocked users and role changes take effect immediately.
- **Role based access** for `founder`, `collaborator` and `admin` through `verifyRole`.
- **Startups, opportunities and applications** with full CRUD and ownership checks (a founder can only touch their own data).
- **Search and filters.** Search by role title or required skills with MongoDB `$regex`, filter by work type and industry with `$in`.
- **Server-side pagination** on the opportunities list.
- **Premium package.** Free founders can post 3 opportunities. Posting more requires a Stripe Checkout payment.
- **Safe payment saving.** The Stripe session is verified on the server and each transaction is stored once (unique `transaction_id`).
- **Admin tools.** Platform statistics, block and unblock users, approve and remove startups, view transactions.
- **Duplicate protection.** A collaborator can apply to an opportunity only once.

## API endpoints

| Method and path | Access | Purpose |
|---|---|---|
| `GET /` , `GET /health` | public | Server and database status |
| `GET /me` | logged in | Current user from the JWT |
| `GET /users/me`, `PATCH /users/me` | logged in | Read and update own profile |
| `GET /startups`, `GET /startups/:id` | public | Approved startups and details |
| `GET /startups/mine` | founder | Own startup |
| `POST /startups`, `PATCH /startups/:id`, `DELETE /startups/:id` | founder | Create, update, delete own startup |
| `GET /opportunities` | public | Browse with `search`, `workType`, `industry`, `page`, `limit` |
| `GET /opportunities/filters`, `GET /opportunities/:id` | public | Filter options and details |
| `GET /opportunities/mine` | founder | Own opportunities |
| `POST /opportunities`, `PATCH /opportunities/:id`, `DELETE /opportunities/:id` | founder | Manage own opportunities |
| `POST /applications` | collaborator | Apply (status starts as `Pending`) |
| `GET /applications/my` | collaborator | Own applications |
| `GET /applications/founder` | founder | Applications for own opportunities |
| `PATCH /applications/:id/status` | founder | Accept or reject |
| `GET /stats/founder`, `GET /stats/collaborator` | founder, collaborator | Dashboard statistics |
| `GET /payments/status`, `POST /payments/create-checkout-session`, `POST /payments/confirm`, `GET /payments/my` | founder | Premium package |
| `GET /admin/stats`, `GET /admin/users`, `PATCH /admin/users/:id/block` | admin | Statistics and user blocking |
| `GET /admin/startups`, `PATCH /admin/startups/:id/approve`, `DELETE /admin/startups/:id` | admin | Startup moderation |
| `GET /admin/transactions` | admin | All payments |

Register, login and logout are handled by Better Auth in the client project. The client also issues the JWT cookie after a successful login.

## Database collections

`user` (created by Better Auth), `startups`, `opportunities`, `applications`, `payments`.

## Project structure

```
startupforge-server/
├── index.js            App setup, middleware, route mounting
├── db.js               MongoDB connection and collections
├── utils.js            Helpers (pagination, regex escape, premium check)
├── middleware/auth.js  verifyToken and verifyRole
├── routes/             startups, opportunities, applications, payments, stats, admin, auth
├── scripts/makeAdmin.js
└── vercel.json
```

## Environment variables

Create a `.env` file in the project root. It is ignored by Git, never commit it.

| Name | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name, defaults to `startupforge`. Must match `MONGODB_DB` in the client |
| `JWT_SECRET` | Secret used to verify the JWT. Must be identical to the client value |
| `CLIENT_URL` | Allowed client origin(s) for CORS, comma separated |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `PREMIUM_PRICE_USD` | Price of the premium package, defaults to 10 |
| `PORT` | Port, defaults to 5000 |

## Run locally

```bash
npm install
npm run dev
```

The API runs on <http://localhost:5000>. Open `/health` to check the database connection.

## Create an admin

Register a normal account in the client, then run:

```bash
npm run make-admin -- your-email@example.com
```

## Deployment

The project is deployed on Vercel using `vercel.json`. Add every variable from the table above in the Vercel project settings and set `CLIENT_URL` to the live client URL.