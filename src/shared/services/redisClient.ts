import { createClient } from "redis";

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (client) return client;

  client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  client.on("connect", () => console.log("Redis conectado!"));
  client.on("error", (err) => {
    console.error("Erro Redis:", err);
    client = null; // Desconecta se der erro
  });

  await client.connect();
  return client;
}
