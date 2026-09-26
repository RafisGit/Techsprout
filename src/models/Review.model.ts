import mongoose, { Document, Schema, Types } from 'mongoose';

export interface Review extends Document {
  user: Types.ObjectId;
  course: Types.ObjectId;
  rating: number;
  comment: string;
  featured: boolean;
}

const reviewSchema: Schema<Review> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
    },
    rating: Number,
    comment: String,
    featured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Review =
  (mongoose.models.Review as mongoose.Model<Review>) ||
  mongoose.model<Review>('Review', reviewSchema);
