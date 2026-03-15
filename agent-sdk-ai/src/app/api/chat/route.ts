import { createAgentUIStreamResponse } from 'ai';
import { createReversoAgent } from '@/lib/agents/reverso-agent';

export async function POST(request: Request) {
  const { messages } = await request.json();

  // Create a fresh agent with current system state
  const agent = await createReversoAgent();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
