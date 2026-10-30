# Exam Studio Upgrade Summary

> **Status note (later pass).** This document describes the MongoDB + accounts migration as it was
> planned. Several things it claims were not actually wired up at the time (the Settings and Agents
> screens, the MCP server, the desktop shell), and MongoDB turned out to be optional rather than
> required. For what the app does now, read `README.md`; for the bugs that were found and fixed, read
> `BUGFIXES.md`.

## Overview
This upgrade transforms Exam Studio from a single-user, file-based application into a multi-user, database-backed application with proper authentication.

## Key Improvements

### 1. MongoDB Implementation
- Replaced JSON file storage with MongoDB/Mongoose
- Added proper data modeling for Users and Library Items
- Implemented efficient querying with indexing
- Maintained backward-compatible API interfaces

### 2. User Authentication System
- JWT-based authentication system
- Secure password hashing with bcrypt
- Registration with email validation and password strength requirements
- Login/logout functionality
- Session persistence via localStorage
- Protected API routes with authentication middleware
- User-specific library isolation

### 3. Enhanced Security
- API keys remain server-side (unchanged)
- Authentication required for all API endpoints
- Passwords never stored in plain text
- Token-based authentication with expiration
- Input validation and sanitization
- Rate limiting preserved (30 generations/hour)

### 4. Improved User Experience
- Login/registration screens
- Persistent login sessions
- Personal libraries (each user sees only their own data)
- "Avoid questions from saved exams" now works per-user
- All existing functionality preserved (notes, exams, flashcards, export)

## Technical Details

### Backend Changes
- **Dependencies Added**: mongodb, mongoose, bcryptjs, jsonwebtoken
- **New Files**:
  - `server/lib/database.js` - MongoDB connection management
  - `server/lib/models/User.js` - User schema and authentication methods
  - `server/lib/models/LibraryItem.js` - Library item schema with user references
  - `server/lib/auth.js` - JWT authentication utilities
- **Modified Files**:
  - `server/package.json` - Added new dependencies
  - `server/lib/store.js` - Replaced JSON storage with MongoDB operations
  - `server/index.js` - Added auth routes, protected API, updated library endpoints
  - `server/.env.example` - Added MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN
  - `server/README.md` - Updated documentation

### Frontend Changes
- **New Files**:
  - `client/src/auth.js` - Authentication service (login, register, token handling)
- **Modified Files**:
  - `client/src/api.js` - Replaced access code headers with JWT authentication
  - `client/src/App.jsx` - Complete rewrite to handle authentication state
    - Login/register UI
    - Authenticated/app states
    - User-specific library access
    - Automatic logout on token expiration/invalid token

## Data Models

### User
```javascript
{
  _id: ObjectId,
  email: string (unique, required),
  passwordHash: string (required),
  name: string (required),
  createdAt: Date
}
```

### LibraryItem
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User, required),
  kind: string ('notes'|'exam'|'flashcards', required),
  title: string (required),
  data: Mixed (required),
  createdAt: Date
}
```

## API Endpoints

### Public Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/health` - Health check (includes user info if authenticated)

### Protected Endpoints (require JWT token)
- `GET /api/library` - Get user's library items
- `GET /api/library/:id` - Get specific library item
- `POST /api/library` - Save new library item
- `DELETE /api/library/:id` - Delete library item
- All existing generation and export endpoints (/api/notes/generate, etc.)

## Environment Variables
```
# AI Configuration
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=

# Server Configuration
PORT=3001
DEMO_MODE=0

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/examstudio

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Rate Limiting
GENERATE_LIMIT_PER_HOUR=30
CORS_ORIGIN=http://localhost:5173
```

## Usage Instructions

1. **First Time Setup**:
   - Copy `server/.env.example` to `server/.env`
   - Fill in required values:
     - `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY`
     - `MONGODB_URI` (MongoDB connection string)
     - `JWT_SECRET` (strong secret for JWT signing)
   - Install dependencies: `npm run setup`
   - Start MongoDB server (or use MongoDB Atlas)
   - Run application: `npm run dev`

2. **User Registration**:
   - Navigate to http://localhost:5173
   - Click "Register" link in auth form
   - Enter email, password, and name
   - Submit to create account

3. **Login**:
   - Navigate to http://localhost:5173
   - Enter email and password
   - Submit to log in
   - Access personal library and create study materials

4. **Logout**:
   - Click username in health indicator (top right)
   - Or clear browser localStorage

## Backward Compatibility
- None - this is a breaking change that requires new user accounts
- Data from previous JSON storage is not migrated
- All existing functionality is preserved for authenticated users

## Future Enhancements
- Google Sheets direct export
- OCR for scanned PDFs
- Full in-app editing of question options/answers
- Password reset functionality
- Email verification
- Admin dashboard