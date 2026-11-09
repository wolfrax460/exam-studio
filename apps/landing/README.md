# Exam Studio Landing

Vite + React + Tailwind static site focused on product overview, pricing and how-it-works.

## Commands
- npm install
- npm run dev
- npm run build (outputs dist)
- npm run preview

## Env
- VITE_BACKEND_URL — backend base URL used for Open Exam Studio button and backend status check.

## Where to edit content
- src/config.ts
- Update TODO placeholders there.

## Deploy
The existing Vercel project uses this directory as its root. `vercel.json` defines the build output and the rewrites to the existing application and API.

## Product imagery

The homepage uses WebP captures of the Exam Studio application running in Chrome with an isolated local database. The captures contain built-in demonstration material, a fictional teacher and learner, and no provider credentials. The social preview is a JPEG export of the dashboard capture.

The graduation-cap SVG is the same first-party mark used by the React application. The AI-assisted teaching and institution-roadmap illustrations were generated for Exam Studio with ImageGen. They are labeled as illustrations and do not represent product screens. No third-party stock imagery is included.
