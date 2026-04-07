"use client";

import Pusher from "pusher-js";

let clientInstance: Pusher | null = null;

export function getPusherClient(): Pusher {
  if (!clientInstance) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2";

    if (!key) {
      throw new Error("NEXT_PUBLIC_PUSHER_KEY is not set");
    }

    clientInstance = new Pusher(key, {
      cluster,
      authEndpoint: "/api/pusher/auth",
      authTransport: "ajax",
    });
  }
  return clientInstance;
}
