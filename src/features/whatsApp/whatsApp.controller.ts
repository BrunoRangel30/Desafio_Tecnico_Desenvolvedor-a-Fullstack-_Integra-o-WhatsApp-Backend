import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
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
    const userId = req.user.id;         // pega o usuário logado do JWT
    const sessionId = uuidv4();         // gera UUID para a sessão
    const session = await this.whatsappService.createAndConnectSession(userId, sessionId);

    return {
      session,
      message: "Sessão criada e aguardando pareamento (QR code)"
    };
  }
}
