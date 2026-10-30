# Exam Studio Power-Up Plan

> **Status note (later pass).** Phases 1 (database + accounts) and the provider work are done; see
> `README.md`. Phase 2 and 3 (Google Sheets, OCR, full in-app question editing) are still open. What
> was actually broken and fixed is listed in `BUGFIXES.md`.

## Current Limitations to Address
1. JSON file storage (no proper database)
2. Shared library (no user accounts)
3. CSV-only export (no direct Google Sheets)
4. No OCR for scanned PDFs
5. Limited question editing (only wording/marks, not options/answers)

## Enhancement Plan

### Phase 1: Database & Authentication Foundation
1. **MongoDB Implementation**
   - Replace JSON storage with MongoDB/Mongoose
   - Keep same API interface for backward compatibility
   - Add connection handling and error management

2. **User Authentication System**
   - Add user registration/login endpoints
   - Implement JWT-based authentication
   - Add password hashing (bcrypt)
   - Protect library endpoints with user context
   - Add user-specific library isolation

### Phase 2: Core Functionality Improvements
3. **Enhanced Question Editing**
   - Extend ExamView to allow editing of options/answers
   - Add UI controls for different question types
   - Maintain validation when options change
   - Update answer generation logic

4. **Google Sheets Integration**
   - Add direct export to Google Sheets API
   - Implement OAuth2 flow for Google API access
   - Add endpoint for creating sheets from exam data
   - Provide option to export directly to Sheets vs CSV download

### Phase 3: Advanced Features
5. **OCR for Scanned PDFs**
   - Integrate OCR library (Tesseract.js or similar)
   - Enhance PDF extraction to handle scanned documents
   - Add preprocessing for better OCR accuracy
   - Provide fallback to current text extraction

## Implementation Order
1. MongoDB setup (foundational)
2. User auth system (builds on DB)
3. Question editing enhancements (frontend/backend)
4. Google Sheets integration (requires auth)
5. OCR enhancement (independent but beneficial)

## Files to Modify
- server/lib/store.js → MongoDB implementation
- server/index.js → Auth routes, protected endpoints
- server/lib/ → New auth utilities, Google Sheets service, OCR service
- client/src/App.jsx → Enhanced editing UI, auth UI, Sheets export button
- shared/ → Potential updates for new data structures
- package.json → New dependencies

## Dependencies to Add
- mongodb/mongoose
- bcryptjs
- jsonwebtoken
- googleapis (for Sheets API)
- tesserdot.js or tesseract.js (for OCR)
- dotenv (already used)

## API Changes
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- Protected library routes: /api/library/* (require user context)
- POST /api/export/google-sheets (new endpoint)
- Enhanced PDF extraction in extract.js

## Database Schema
- Users: { id, email, passwordHash, name, createdAt }
- LibraryItems: { id, userId, kind, title, data, createdAt }
- Sessions: (handled by JWT)

## Security Considerations
- HTTPS required in production
- Password hashing with bcrypt
- JWT expiration and refresh
- Input validation and sanitization
- Rate limiting on auth endpoints
- CORS configuration for frontend