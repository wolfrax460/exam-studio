import mongoose from 'mongoose';

const oauthClientSchema = new mongoose.Schema({
  clientId: { type: String, required: true, unique: true, index: true },
  clientSecret: { type: String, default: '' },
  redirectUris: { type: [String], required: true },
  clientName: { type: String, default: 'Exam Studio MCP client' },
  logoUri: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const OAuthClient = mongoose.model('OAuthClient', oauthClientSchema);
export default OAuthClient;
