import mongoose from 'mongoose';

const libraryItemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  kind: {
    type: String,
    required: true,
    enum: ['notes', 'exam', 'flashcards', 'handout'],
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound index for user-specific queries
libraryItemSchema.index({ userId: 1, createdAt: -1 });
libraryItemSchema.index({ userId: 1, kind: 1 });

const LibraryItem = mongoose.model('LibraryItem', libraryItemSchema);
export default LibraryItem;