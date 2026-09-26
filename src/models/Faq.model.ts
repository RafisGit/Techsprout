import mongoose, { Document, Schema } from 'mongoose';

export interface FAQ extends Document {
  question: string;
  answer: string;
}

const faqSchema: Schema<FAQ> = new Schema(
  {
    question: String,
    answer: String,
  },
  { timestamps: true }
);

export const FAQ =
  (mongoose.models.FAQ as mongoose.Model<FAQ>) || mongoose.model<FAQ>('FAQ', faqSchema);
