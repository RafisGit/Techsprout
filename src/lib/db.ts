import mongoose from 'mongoose';

type MongooseGlobal = typeof global & {
  mongoose: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const cached: MongooseGlobal = global as MongooseGlobal;

const DB_URI = process.env.DB_URI as string;

if (!DB_URI) {
  throw new Error('DB_URI is not defined in the environment variables');
}

if (!cached.mongoose) {
  cached.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.mongoose.conn) {
    return cached.mongoose.conn;
  }

  if (!cached.mongoose.promise) {
    cached.mongoose.promise = mongoose.connect(DB_URI);
  }

  try {
    cached.mongoose.conn = await cached.mongoose.promise;
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    throw error;
  }

  return cached.mongoose.conn;
}
