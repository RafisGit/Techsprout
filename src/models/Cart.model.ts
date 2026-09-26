import mongoose, { Document, Schema, Types } from 'mongoose';

export interface Cart extends Document {
  user: Types.ObjectId;
  items: {
    course: Types.ObjectId;
    price: number;
  }[];
  totalAmount: number;
}

const cartSchema: Schema<Cart> = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      { course: { type: Schema.Types.ObjectId, ref: 'Course', required: true }, price: Number },
    ],
    totalAmount: Number,
  },
  { timestamps: true }
);

export const Cart =
  (mongoose.models.Cart as mongoose.Model<Cart>) || mongoose.model<Cart>('Cart', cartSchema);
