import { useChatMessageHandler, ChatMessageHandlerContext } from '../hooks/useChatMessageHandler'

interface GlobalChatHandlerProps {
  children: React.ReactNode
}

export default function GlobalChatHandler({ children }: GlobalChatHandlerProps) {
  const handlerMethods = useChatMessageHandler()

  return (
    <ChatMessageHandlerContext.Provider value={handlerMethods}>
      {children}
    </ChatMessageHandlerContext.Provider>
  )
}
