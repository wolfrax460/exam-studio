# Copy to .env and fill in. Never commit .env, never paste keys into chat.

# Which AI to use: deepseek or anthropic.
# If this is empty, DeepSeek is used when only DEEPSEEK_API_KEY is set.
AI_PROVIDER=deepseek

# DeepSeek (https://platform.deepseek.com)
DEEPSEEK_API_KEY=
# Optional: override the model. Default for DeepSeek is deepseek-flash.
# AI_MODEL=deepseek-flash

# Anthropic (billed separately from a Claude.ai plan)
ANTHROPIC_API_KEY=

PORT=3001

# Set to 1 to try the app with sample output and no API calls
DEMO_MODE=0

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/examstudio

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
# Optional: token expiration (e.g., 7d, 24h)
JWT_EXPIRES_IN=7d

# Optional
GENERATE_LIMIT_PER_HOUR=30
# CORS_ORIGIN=http://localhost:5173
