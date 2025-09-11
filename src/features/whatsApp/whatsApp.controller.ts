import { Get, Param, Controller, Post, Req, UseGuards, Body } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WhatsappService } from "./service/whatsapp.service";
import { v4 as uuidv4 } from "uuid";

// Tipagem do request com user
interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string };
}

@Controller("whatsapp")
@UseGuards(AuthGuard("jwt"))
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) { }

  /** Cria uma sessão automática para o usuário logado */
  @Post("/sessions/auto")
  async create(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const sessionId = uuidv4();
    const session = await this.whatsappService.createAndConnectSession(userId, sessionId);
    //ativa
    await this.whatsappService.connect(sessionId);
    return {
      session,
      message: "Sessão criada e aguardando pareamento (QR code)"
    };
  }

  @Get("/conversations/:sessionId")
  async getConversations(@Param("sessionId") sessionId: string) {
    return this.whatsappService.getConversationsBySession(sessionId);
  }

  @Post("conversations/create")
  async createConversation(@Body() body: { sessionId: string }) {
    return this.whatsappService.createConversation(body.sessionId);
  }
}
