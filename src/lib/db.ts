import mongoose from 'mongoose';

type MongooseGlobal = typeof globalThis & {
  mongoose?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const cached: MongooseGlobal = globalThis as MongooseGlobal;

if (!cached.mongoose) {
  cached.mongoose = { conn: null, promise: null };
}

/**
 * Connects to MongoDB lazily at runtime when an endpoint requires it.
 * Validates DB_URI at runtime rather than during module evaluation/build time.
 * Reuses existing connections across invocations in serverless environments.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (cached.mongoose?.conn) {
    return cached.mongoose.conn;
  }

  const DB_URI = process.env.DB_URI;

  if (!DB_URI) {
    throw new Error('DB_URI is not defined in the environment variables');
  }

  if (!cached.mongoose!.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
    };

    cached.mongoose!.promise = mongoose.connect(DB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.mongoose!.conn = await cached.mongoose!.promise;
  } catch (error) {
    cached.mongoose!.promise = null;
    console.error('Failed to connect to the database:', error);
    throw error;
  }

  return cached.mongoose!.conn;
}

