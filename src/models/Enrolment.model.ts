import mongoose, { Document, Schema, Types } from 'mongoose';

export interface Enrolment extends Document {
  user: Types.ObjectId;
  course: Types.ObjectId;
  status: 'active' | 'completed';
}

const enrolmentSchema: Schema<Enrolment> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
    },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
  },
  { timestamps: true }
);

export const Enrolment =
  (mongoose.models.Enrolment as mongoose.Model<Enrolment>) ||
  mongoose.model<Enrolment>('Enrolment', enrolmentSchema);
