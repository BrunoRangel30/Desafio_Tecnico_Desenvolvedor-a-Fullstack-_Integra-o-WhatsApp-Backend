import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import { createClient } from "redis";

type RedisClientType = ReturnType<typeof createClient>;

@Injectable()
export class IAService {
  private genAI: GoogleGenAI;
  private redisClient: RedisClientType;
  private model: string;
  private maxHistory: number;
  private isRedisConnected = false;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("GEMINI_API_KEY");
    const redisUrl = this.configService.get<string>("REDIS_URL");
    const model = this.configService.get<string>("GEMINI_MODEL") || "gemini-2.0-flash";
    const maxHistory = Number(this.configService.get<string>("MAX_HISTORY") || 5);

    if (!apiKey || !redisUrl) {
      throw new Error("GEMINI_API_KEY e REDIS_URL são obrigatórios no .env");
    }

    this.genAI = new GoogleGenAI({ apiKey });
    this.redisClient = createClient({ url: redisUrl });
    this.model = model;
    this.maxHistory = maxHistory;

    this.redisClient.on("connect", () => {
     // console.log("Conectado ao Redis com sucesso!");
      this.isRedisConnected = true;
    });

    this.redisClient.on("error", (err) => {
      console.error("Erro de conexão com o Redis:", err);
      this.isRedisConnected = false;
    });

    this.connectToRedis();
  }

  private async connectToRedis() {
    try {
      await this.redisClient.connect();
    } catch (err) {}
  }

  private hashMessage(message: string): string {
    return crypto.createHash("md5").update(message).digest("hex");
  }
 //prompt simples
  private buildPrompt(userMessage: string, history: string[]): string {
    const lastMessages = history.slice(-this.maxHistory).join("\n");
    return `Histórico resumido:\n${lastMessages}\n\nUsuário: ${userMessage}\nResponda de forma curta e objetiva (máx. 2 frases):`;
  }

  async getResponse(userMessage: string, conversationHistory: string[]): Promise<string> {

    const prompt = this.buildPrompt(userMessage, conversationHistory);
    const promptHash = this.hashMessage(prompt);
     //Cache em Redis
    if (this.isRedisConnected) {
      const cachedResponse = await this.redisClient.get(promptHash);
      if (cachedResponse) return cachedResponse;
    }

    try {
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      const aiReply = response?.text?.trim() ?? "Não foi possível obter uma resposta.";

      if (this.isRedisConnected) {
        await this.redisClient.set(promptHash, aiReply, { EX: 3600 });
      }

      return aiReply;
    } catch (error) {
      console.error("Erro na chamada à API do Gemini:", error);
      return "Desculpe, ocorreu um erro ao processar sua solicitação.";
    }
  }
}
