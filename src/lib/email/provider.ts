export type TransactionalEmailAddress = {
  email: string;
  name?: string;
};

export type TransactionalEmailMessage = {
  to: TransactionalEmailAddress;
  from: TransactionalEmailAddress;
  subject: string;
  text: string;
  html: string;
};

export type TransactionalEmailSendResult = {
  messageId: string;
};

export interface TransactionalEmailProvider {
  send(message: TransactionalEmailMessage): Promise<TransactionalEmailSendResult>;
}

export class CloudflareEmailProvider implements TransactionalEmailProvider {
  constructor(private readonly binding: SendEmail) {}

  async send(message: TransactionalEmailMessage): Promise<TransactionalEmailSendResult> {
    const to = message.to.name ? { email: message.to.email, name: message.to.name } : message.to.email;
    const from = message.from.name ? { email: message.from.email, name: message.from.name } : message.from.email;
    return this.binding.send({
      to,
      from,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export type FakeEmailProvider = TransactionalEmailProvider & {
  deliveries: TransactionalEmailMessage[];
};

export function createFakeEmailProvider(options: { failWith?: Error; messageIdPrefix?: string } = {}): FakeEmailProvider {
  const deliveries: TransactionalEmailMessage[] = [];
  return {
    deliveries,
    async send(message) {
      if (options.failWith) throw options.failWith;
      deliveries.push(structuredClone(message));
      return { messageId: `${options.messageIdPrefix ?? "fake-email"}-${deliveries.length}` };
    },
  };
}
