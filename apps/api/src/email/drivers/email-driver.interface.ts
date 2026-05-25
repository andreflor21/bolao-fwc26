export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface IEmailDriver {
  send(message: EmailMessage): Promise<void>;
}
