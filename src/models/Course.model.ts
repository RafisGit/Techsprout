import mongoose, { Document, Schema, Types } from 'mongoose';

export interface Course extends Document {
  title: string;
  category: string;
  price: number;
  isFree: boolean;
  thumbnail: string;
  demoVideo: string;
  lessons: string[];
  featured: boolean;
  instructor: Types.ObjectId;
  duration: string;
  reviews: Types.ObjectId[];
  enrolments: Types.ObjectId[];
  description: string;
  audience: string[];
  requirements: string[];
  resources: string[];
  keyLearningPoints: string[];
}

const courseSchema: Schema<Course> = new Schema(
  {
    title: String,
    category: String,
    price: Number,
    isFree: { type: Boolean, default: false },
    thumbnail: String,
    demoVideo: String,
    lessons: [String],
    featured: { type: Boolean, default: false },
    instructor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    duration: String,
    reviews: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Review',
      },
    ],
    enrolments: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Enrolment',
      },
    ],
    description: String,
    audience: [String],
    requirements: [String],
    resources: [String],
    keyLearningPoints: [String],
  },
  { timestamps: true }
);

export const Course =
  (mongoose.models.Course as mongoose.Model<Course>) ||
  mongoose.model<Course>('Course', courseSchema);
