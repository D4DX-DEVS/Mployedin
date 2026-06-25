import mongoose from "mongoose";
import { ensureIndexes } from "./indexes";
import logger from "@/lib/logger";

// Validated lazily inside connectDB so module evaluation doesn't throw
// when MONGODB_URI is absent during Next.js build-time static analysis.
const MONGODB_URI = process.env.MONGODB_URI ?? "";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Pool sizing is env-tunable so serverless (many short-lived instances) and
    // long-lived Node servers can be tuned without code changes.
    // ponytail: serverless fan-out = instances × maxPoolSize against the Atlas
    // connection cap — keep maxPoolSize low (e.g. 5) on Vercel/Lambda and size
    // the Atlas tier accordingly; maxIdleTimeMS lets idle conns be reclaimed so
    // bursts don't permanently pin connections.
    const opts = {
      bufferCommands: false,
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE ?? "10", 10),
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      autoIndex: false, // We manage indexes in ensureIndexes()
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then(async (mongooseInstance) => {
        logger.info("MongoDB connected");
        await ensureIndexes();
        return mongooseInstance;
      })
      .catch((err) => {
        cached.promise = null;
        logger.error({ err }, "MongoDB connection error");
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
