import mongoose from 'mongoose';

const oauthCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId: { type: String, required: true, index: true },
  redirectUri: { type: String, required: true },
  codeChallenge: { type: String, required: true },
  scope: { type: String, default: '' },
  state: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  used: { type: Boolean, default: false },
});

const OAuthCode = mongoose.model('OAuthCode', oauthCodeSchema);
export default OAuthCode;
