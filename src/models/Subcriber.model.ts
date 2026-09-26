import mongoose, { Document, Schema } from 'mongoose';

export interface Subscriber extends Document {
  email: string;
}

const subscriberSchema: Schema<Subscriber> = new Schema(
  {
    email: String,
  },
  { timestamps: true }
);

export const Subscriber =
  (mongoose.models.Subscriber as mongoose.Model<Subscriber>) ||
  mongoose.model<Subscriber>('Subscriber', subscriberSchema);
