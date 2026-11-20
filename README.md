# Smart Campus Complaint Management

Students submit and track complaints. Admins manage them and mark them Completed.
Built with Node.js, Express, MongoDB (Mongoose), and a plain HTML/CSS/JS frontend.

## 1. Install MongoDB locally
- **Windows/macOS/Linux:** install MongoDB Community Server from https://www.mongodb.com/try/download/community
- Make sure it is running (default: `mongodb://127.0.0.1:27017`).
  - Windows: it runs as a service after install (check "Services" -> MongoDB Server).
  - macOS (Homebrew): `brew services start mongodb-community`
  - Linux (systemd): `sudo systemctl start mongod`
- Optional: install MongoDB Compass to look at the data in the `smart_campus` database.

## 2. Set up the project
```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```
Open `.env` and set `JWT_SECRET` (any long random string) and `ADMIN_PASSWORD`.

## 3. Run
```bash
npm start
```
Expected output:
```
Connected to MongoDB
Admin account created. Username: ADMIN
Smart Campus running at http://localhost:3000
```
Open http://localhost:3000

## How to use
- **Student:** Student portal -> Create account (name, roll number, password) -> New complaint -> My complaints to track status.
- **Admin:** Admin dashboard -> sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` -> Start work / Mark as completed / add a note.
- Students can search their complaints and filter them by status. The "My complaints" page refreshes every 20 seconds, so status changes appear automatically.
- The header shows live API and MongoDB availability; the check runs every 30 seconds.

## Project structure
```
server.js        Express app, auth, API routes, startup
models.js        Mongoose models: User, Complaint, Counter
public/index.html  Student portal + Admin dashboard (frontend)
.env.example     Settings template (copy to .env)
```

## API
| Method | Route | Who | Purpose |
|---|---|---|---|
| GET | /api/health | public | API and MongoDB readiness status |
| POST | /api/auth/register | public | Create student account |
| POST | /api/auth/login | public | Log in (student or admin) |
| GET | /api/auth/me | logged in | Current user |
| POST | /api/complaints | student | Submit complaint |
| GET | /api/complaints/mine | student | Own complaints |
| GET | /api/complaints | admin | All complaints (`?status=&category=&q=`) |
| GET | /api/complaints/stats | admin | Counts by status |
| PATCH | /api/complaints/:id | admin | Update `status` and/or `note` |
| DELETE | /api/complaints/:id | admin | Delete complaint |

## Troubleshooting
- **"Could not connect to MongoDB"** - MongoDB is not running, or `MONGODB_URI` in `.env` is wrong.
- **"Missing JWT_SECRET"** - you have not created `.env` yet.
- **Forgot the admin password** - delete the admin user in Compass (collection `users`, role `admin`), change `ADMIN_PASSWORD` in `.env`, and restart.

## Before real deployment
Use HTTPS, a strong `JWT_SECRET`, and consider adding rate limiting (e.g. `express-rate-limit`) on the login routes.
