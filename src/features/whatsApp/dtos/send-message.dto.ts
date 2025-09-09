// dto/send-message.dto.ts
export class SendMessageDto {
  sessionId: string;
  to: string;
  text: string;
  conversationId: string;
}
