'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectItem } from '@/components/ui/select'
import { createBot, updateBot, type Bot, type BotChannelConfig, type KnowledgeBase, type ExperienceStore } from '@/actions/bots'

interface BotFormProps {
  bot?: Bot
  config?: BotChannelConfig
  kbs: KnowledgeBase[]
  assignedKbIds?: string[]
  stores: ExperienceStore[]
  isNew: boolean
}

function PasswordInput({
  id,
  name,
  defaultValue,
  placeholder,
  required,
}: {
  id: string
  name: string
  defaultValue?: string | null
  placeholder?: string
  required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        required={required}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

export function BotForm({ bot, config, kbs, assignedKbIds, stores, isNew }: BotFormProps) {
  const router = useRouter()
  const [tab, setTab] = useState('general')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Controlled state for fields that drive conditional rendering
  const [channelType, setChannelType] = useState<'telegram' | 'whatsapp'>(
    bot?.channel_type ?? 'telegram'
  )
  const [triggerMode, setTriggerMode] = useState<'mention' | 'keyword'>(
    bot?.trigger_mode ?? 'mention'
  )
  const [webSearchFallback, setWebSearchFallback] = useState(bot?.web_search_fallback ?? false)
  const [sendGreeting, setSendGreeting] = useState(config?.send_greeting ?? false)
  const [selectedKbIds, setSelectedKbIds] = useState<Set<string>>(
    new Set(assignedKbIds ?? (bot?.knowledge_base_id ? [bot.knowledge_base_id] : []))
  )

  function toggleKb(kbId: string) {
    setSelectedKbIds((prev) => {
      const next = new Set(prev)
      if (next.has(kbId)) next.delete(kbId)
      else next.add(kbId)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)

    const fd = new FormData(e.currentTarget)

    const botData: Partial<Bot> = {
      name: fd.get('name') as string,
      description: (fd.get('description') as string) || null,
      channel_type: channelType,
      experience_store_id: (fd.get('experience_store_id') as string) || null,
      system_prompt: (fd.get('system_prompt') as string) || null,
      trigger_mode: triggerMode,
      trigger_keyword: triggerMode === 'keyword' ? ((fd.get('trigger_keyword') as string) || null) : null,
      llm_model: fd.get('llm_model') as string,
      max_response_tokens: parseInt(fd.get('max_response_tokens') as string, 10),
      web_search_fallback: webSearchFallback,
      group_context_messages: parseInt(fd.get('group_context_messages') as string, 10),
      doc_retrieval_threshold: parseFloat(fd.get('doc_retrieval_threshold') as string),
      exp_retrieval_threshold: parseFloat(fd.get('exp_retrieval_threshold') as string),
    }

    const configData: Partial<BotChannelConfig> = {
      channel_type: channelType,
      send_greeting: sendGreeting,
    }

    if (channelType === 'telegram') {
      configData.tg_bot_token = (fd.get('tg_bot_token') as string) || null
      configData.tg_bot_username = (fd.get('tg_bot_username') as string) || null
      configData.greeting_message_tg = sendGreeting
        ? ((fd.get('greeting_message_tg') as string) || null)
        : null
    } else {
      configData.wa_phone_number_id = (fd.get('wa_phone_number_id') as string) || null
      configData.wa_access_token = (fd.get('wa_access_token') as string) || null
      configData.wa_verify_token = (fd.get('wa_verify_token') as string) || null
      configData.greeting_message_wa = sendGreeting
        ? ((fd.get('greeting_message_wa') as string) || null)
        : null
    }

    const kbIds = Array.from(selectedKbIds)

    try {
      if (isNew) {
        await createBot({ bot: botData, config: configData, kbIds })
        toast.success('Bot created successfully')
      } else {
        await updateBot(bot!.id, { bot: botData, config: configData, kbIds })
        toast.success('Bot updated successfully')
      }
      router.push('/bots')
    } catch (err) {
      toast.error('Failed to save bot: ' + (err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="channel">Channel Config</TabsTrigger>
        </TabsList>

        {/* ── General Tab ── */}
        <TabsContent value="general">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    defaultValue={bot?.name ?? ''}
                    placeholder="My Bot"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    name="description"
                    defaultValue={bot?.description ?? ''}
                    placeholder="What does this bot do?"
                    rows={3}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel_type">Channel Type</Label>
                  <Select
                    id="channel_type"
                    name="channel_type"
                    value={channelType}
                    onChange={(e) => setChannelType(e.target.value as 'telegram' | 'whatsapp')}
                    disabled={!isNew}
                  >
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </Select>
                  {!isNew && (
                    <p className="text-xs text-muted-foreground">Channel type cannot be changed after creation.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Knowledge &amp; Experience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Knowledge Bases</Label>
                  {kbs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No knowledge bases found.</p>
                  ) : (
                    <div className="rounded-lg border border-input divide-y divide-border">
                      {kbs.map((kb) => (
                        <label
                          key={kb.id}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedKbIds.has(kb.id)}
                            onChange={() => toggleKb(kb.id)}
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span className="text-sm">{kb.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {selectedKbIds.size === 0 && (
                    <p className="text-xs text-muted-foreground">No knowledge base selected — bot will only use web search and experience store.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience_store_id">Experience Store</Label>
                  <Select
                    id="experience_store_id"
                    name="experience_store_id"
                    defaultValue={bot?.experience_store_id ?? ''}
                  >
                    <SelectItem value="">None</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Behaviour</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="system_prompt">System Prompt</Label>
                  <textarea
                    id="system_prompt"
                    name="system_prompt"
                    defaultValue={bot?.system_prompt ?? ''}
                    placeholder="You are a helpful assistant..."
                    rows={5}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trigger_mode">Trigger Mode</Label>
                  <Select
                    id="trigger_mode"
                    name="trigger_mode"
                    value={triggerMode}
                    onChange={(e) => setTriggerMode(e.target.value as 'mention' | 'keyword')}
                  >
                    <SelectItem value="mention">Mention</SelectItem>
                    <SelectItem value="keyword">Keyword</SelectItem>
                  </Select>
                </div>
                {triggerMode === 'keyword' && (
                  <div className="space-y-2">
                    <Label htmlFor="trigger_keyword">Trigger Keyword</Label>
                    <Input
                      id="trigger_keyword"
                      name="trigger_keyword"
                      defaultValue={bot?.trigger_keyword ?? ''}
                      placeholder="!ask"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="web_search_fallback">Web Search Fallback</Label>
                    <p className="text-xs text-muted-foreground">
                      Search the web when knowledge base has no answer
                    </p>
                  </div>
                  <Switch
                    id="web_search_fallback"
                    checked={webSearchFallback}
                    onCheckedChange={setWebSearchFallback}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="group_context_messages">Group Context Messages</Label>
                    <Input
                      id="group_context_messages"
                      name="group_context_messages"
                      type="number"
                      min="0"
                      max="20"
                      defaultValue={bot?.group_context_messages ?? 5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_response_tokens">Max Response Tokens</Label>
                    <Input
                      id="max_response_tokens"
                      name="max_response_tokens"
                      type="number"
                      min="1"
                      defaultValue={bot?.max_response_tokens ?? 1024}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc_retrieval_threshold">Doc Retrieval Threshold</Label>
                    <Input
                      id="doc_retrieval_threshold"
                      name="doc_retrieval_threshold"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      defaultValue={bot?.doc_retrieval_threshold ?? 0.7}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exp_retrieval_threshold">Exp Retrieval Threshold</Label>
                    <Input
                      id="exp_retrieval_threshold"
                      name="exp_retrieval_threshold"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      defaultValue={bot?.exp_retrieval_threshold ?? 0.7}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>LLM</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="llm_model">LLM Model</Label>
                  <Input
                    id="llm_model"
                    name="llm_model"
                    defaultValue={bot?.llm_model ?? 'claude-3-5-sonnet-20241022'}
                    placeholder="claude-3-5-sonnet-20241022"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Channel Config Tab ── */}
        <TabsContent value="channel">
          <div className="space-y-6">
            {channelType === 'telegram' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Telegram</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tg_bot_token">Bot Token *</Label>
                    <PasswordInput
                      id="tg_bot_token"
                      name="tg_bot_token"
                      defaultValue={config?.tg_bot_token}
                      placeholder="123456:ABC-..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tg_bot_username">Bot Username</Label>
                    <Input
                      id="tg_bot_username"
                      name="tg_bot_username"
                      defaultValue={config?.tg_bot_username ?? ''}
                      placeholder="my_bot"
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>WhatsApp</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="wa_phone_number_id">Phone Number ID</Label>
                    <Input
                      id="wa_phone_number_id"
                      name="wa_phone_number_id"
                      defaultValue={config?.wa_phone_number_id ?? ''}
                      placeholder="1234567890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa_access_token">Access Token</Label>
                    <PasswordInput
                      id="wa_access_token"
                      name="wa_access_token"
                      defaultValue={config?.wa_access_token}
                      placeholder="EAAb..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa_verify_token">Verify Token</Label>
                    <Input
                      id="wa_verify_token"
                      name="wa_verify_token"
                      defaultValue={config?.wa_verify_token ?? ''}
                      placeholder="my-verify-token"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Greeting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="send_greeting">Send Greeting</Label>
                    <p className="text-xs text-muted-foreground">
                      Send a greeting when a user starts a conversation
                    </p>
                  </div>
                  <Switch
                    id="send_greeting"
                    checked={sendGreeting}
                    onCheckedChange={setSendGreeting}
                  />
                </div>
                {sendGreeting && channelType === 'telegram' && (
                  <div className="space-y-2">
                    <Label htmlFor="greeting_message_tg">Greeting Message (Telegram)</Label>
                    <textarea
                      id="greeting_message_tg"
                      name="greeting_message_tg"
                      defaultValue={config?.greeting_message_tg ?? ''}
                      placeholder="Hello! How can I help you today?"
                      rows={3}
                      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                  </div>
                )}
                {sendGreeting && channelType === 'whatsapp' && (
                  <div className="space-y-2">
                    <Label htmlFor="greeting_message_wa">Greeting Message (WhatsApp)</Label>
                    <textarea
                      id="greeting_message_wa"
                      name="greeting_message_wa"
                      defaultValue={config?.greeting_message_wa ?? ''}
                      placeholder="Hello! How can I help you today?"
                      rows={3}
                      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/bots')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isNew ? 'Create Bot' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
