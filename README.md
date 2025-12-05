#  Airtable Form Builder - Backend API

Express.js backend with MongoDB, Airtable OAuth, webhooks, and file uploads.

##  Live API

**Production**: `https://your-backend.railway.app`

##  Features

-  Airtable OAuth 2.0 with PKCE
-  JWT Authentication
-  MongoDB with Mongoose
-  Webhook synchronization
-  File uploads (Cloudinary)
-  Conditional logic engine
-  Rate limiting & security

##  Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4.18
- **Database**: MongoDB Atlas
- **Authentication**: JWT + Airtable OAuth
- **File Storage**: Cloudinary
- **Testing**: Jest

##  Local Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in:
```env
MONGODB_URI=your_mongodb_connection_string
AIRTABLE_CLIENT_ID=your_airtable_client_id
AIRTABLE_CLIENT_SECRET=your_airtable_client_secret
AIRTABLE_REDIRECT_URI=http://localhost:5000/api/auth/airtable/callback
FRONTEND_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
ENCRYPTION_KEY=32_char_hex_string
```

### 3. Start Development Server
```bash
npm run dev
```

Server runs at `http://localhost:5000`

##  Railway Deployment

### Environment Variables
Set these in Railway dashboard:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
AIRTABLE_CLIENT_ID=...
AIRTABLE_CLIENT_SECRET=...
AIRTABLE_REDIRECT_URI=https://your-backend.railway.app/api/auth/airtable/callback
FRONTEND_URL=https://your-frontend.vercel.app
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
WEBHOOK_BASE_URL=https://your-backend.railway.app
JWT_SECRET=production_secret
SESSION_SECRET=production_secret
ENCRYPTION_KEY=32_char_hex
```

### Deploy Steps
1. Connect GitHub repo to Railway
2. Set root directory to `/` (backend is root)
3. Add environment variables
4. Deploy!

##  API Endpoints

### Authentication
- `GET /api/auth/airtable` - Initiate OAuth
- `GET /api/auth/airtable/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token

### Forms
- `POST /api/forms` - Create form
- `GET /api/forms` - List user forms
- `GET /api/forms/:id` - Get form (public)
- `PUT /api/forms/:id` - Update form
- `DELETE /api/forms/:id` - Delete form
- `POST /api/forms/:id/submit` - Submit response

### Responses
- `GET /api/forms/:formId/responses` - List responses

### Webhooks
- `POST /api/webhooks/airtable` - Airtable webhook receiver
- `POST /api/webhooks/register/:formId` - Register webhook

### Airtable Proxy
- `GET /api/airtable/bases` - List bases
- `GET /api/airtable/bases/:baseId/tables` - List tables
- `GET /api/airtable/bases/:baseId/tables/:tableId/fields` - List fields

##  Testing

```bash
npm test
```

##  Project Structure

```
backend/
 config/          # Database config
 middleware/      # Auth, error handling
 models/          # Mongoose schemas
 routes/          # API endpoints
 utils/           # Helper functions
 tests/           # Jest tests
 server.js        # Entry point
```

##  Security

- Helmet.js for headers
- Rate limiting (100 req/15min)
- CORS configured
- JWT token expiry
- Environment variable validation

##  License

MIT
