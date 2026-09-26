import mongoose, { Document, Schema, Types } from 'mongoose';

export interface Instructor extends Document {
  user: Types.ObjectId;
  expertise: string[];
  isTop: boolean;
}

const instructorSchema: Schema<Instructor> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expertise: [String],
    isTop: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
export const Instructor =
  (mongoose.models.Instructor as mongoose.Model<Instructor>) ||
  mongoose.model<Instructor>('Instructor', instructorSchema);
