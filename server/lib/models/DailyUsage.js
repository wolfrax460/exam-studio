import mongoose from 'mongoose';

const dailyUsageSchema = new mongoose.Schema({
  key: { type: String, required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 14 * 24 * 60 * 60 },
});

dailyUsageSchema.index({ key: 1, day: 1 }, { unique: true });

const DailyUsage = mongoose.model('DailyUsage', dailyUsageSchema);
export default DailyUsage;
