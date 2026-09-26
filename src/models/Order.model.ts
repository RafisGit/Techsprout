import mongoose, { Document, Schema, Types } from 'mongoose';

export interface Order extends Document {
  user: Types.ObjectId;
  courses: Types.ObjectId[];
  totalAmount: number;
}

const orderSchema: Schema<Order> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    courses: [{ type: Schema.Types.ObjectId, ref: 'Course', required: true }],
    totalAmount: Number,
  },
  { timestamps: true }
);

export const Order =
  (mongoose.models.Order as mongoose.Model<Order>) || mongoose.model<Order>('Order', orderSchema);
