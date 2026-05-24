SkillLink - Minimal Backend Skeleton

This folder contains a minimal Node.js + Express backend skeleton for the SkillLink project.

Quick start

1. Copy `.env.example` to `.env` and update the values.

2. Install dependencies:

```powershell
cd server; npm install
```

3. Run in development (nodemon):

```powershell
npm run dev
```

4. The API will be available at http://localhost:5000 by default.

Notes

- This is a minimal starting point with User, Post, Conversation and Message models.
- JWT auth is implemented for API routes and socket authentication.
- Expand controllers, validation, tests, and storage (Cloudinary/Firebase) as needed.
