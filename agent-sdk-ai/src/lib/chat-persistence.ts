import type { ReversoPaths } from './config'
import type { ReversoUIMessage } from '@/types/ui-message'
import { loadChatMessages, saveChatMessages } from './session-store'

export async function loadPersistedChat(
  paths: ReversoPaths
): Promise<ReversoUIMessage[]> {
  const messages = await loadChatMessages(paths)
  return messages as ReversoUIMessage[]
}

export async function persistChat(
  paths: ReversoPaths,
  messages: ReversoUIMessage[]
): Promise<void> {
  await saveChatMessages(paths, messages)
}
