import { Box, List } from '@mui/material'
import { useStore } from '../../store'
import { useWorkflow } from '../../hooks/useWorkflow'
import AgentListItem from './AgentListItem'

export default function AgentSidebar() {
  const selectedChatAgent = useStore((state) => state.selectedChatAgent)
  const setSelectedChatAgent = useStore((state) => state.setSelectedChatAgent)
  const chatThreads = useStore((state) => state.chatThreads)
  const markChatRead = useStore((state) => state.markChatRead)

  // Get agents from workflow (based on current project type)
  const { agents } = useWorkflow()

  const handleSelectAgent = (agentId: string) => {
    setSelectedChatAgent(agentId)
    markChatRead(agentId)
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <List disablePadding>
        {agents.map((agent) => {
          const thread = chatThreads[agent.id]
          return (
            <AgentListItem
              key={agent.id}
              agent={agent}
              selected={selectedChatAgent === agent.id}
              unreadCount={thread?.unreadCount || 0}
              isTyping={thread?.isTyping || false}
              onClick={() => handleSelectAgent(agent.id)}
            />
          )
        })}
      </List>
    </Box>
  )
}
