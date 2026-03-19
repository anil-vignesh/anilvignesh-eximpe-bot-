import { listAssignments, listBots, listUnrecognisedChats, listApiVersions } from '@/actions/chat-assignments'
import { ChatAssignmentsClient } from './chat-assignments-client'

export default async function ChatAssignmentsPage() {
  const [assignments, bots, unrecognisedChats, apiVersions] = await Promise.all([
    listAssignments(),
    listBots(),
    listUnrecognisedChats(),
    listApiVersions(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Chat Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign bots to Telegram and WhatsApp chats.
          </p>
        </div>

        <ChatAssignmentsClient
          initialAssignments={assignments}
          bots={bots}
          unrecognisedChats={unrecognisedChats}
          apiVersions={apiVersions}
        />
      </div>
    </div>
  )
}
