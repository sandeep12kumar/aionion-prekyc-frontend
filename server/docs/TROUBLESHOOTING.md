# KYC API troubleshooting

1. Start the API in `server` with `npm run dev`.
2. Open `http://localhost:3001/api/health` in a browser.
3. A successful response is `{ "ok": true, "database": "kyc_master" }`.
4. If it responds with a `debug.code` of `28P01`, PostgreSQL rejected the username/password in `.env`.
5. In pgAdmin, run `../sql/verify-database.sql` against the `kyc_master` database to confirm that `kyc_master_details` exists and inspect saved rows.

Never commit `server/.env`; it contains database credentials.
