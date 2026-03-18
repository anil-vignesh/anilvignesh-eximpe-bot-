'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { updateSettings, type Settings } from '@/actions/settings'

interface SettingsFormProps {
  settings: Settings | null
}

function PasswordInput({
  id,
  name,
  defaultValue,
  placeholder,
}: {
  id: string
  name: string
  defaultValue?: string | null
  placeholder?: string
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

export function SettingsForm({ settings }: SettingsFormProps) {
  const [autoGen, setAutoGen] = useState(settings?.experience_auto_generation ?? false)

  async function handleAiModels(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    try {
      await updateSettings({
        anthropic_api_key: (fd.get('anthropic_api_key') as string) || null,
        voyage_api_key: (fd.get('voyage_api_key') as string) || null,
        default_llm_model: fd.get('default_llm_model') as string,
      })
      toast.success('AI model settings saved')
    } catch (err) {
      toast.error('Failed to save: ' + (err as Error).message)
    }
  }

  async function handleExperience(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    try {
      await updateSettings({
        experience_auto_generation: autoGen,
        experience_dedup_threshold: parseFloat(fd.get('experience_dedup_threshold') as string),
      })
      toast.success('Experience settings saved')
    } catch (err) {
      toast.error('Failed to save: ' + (err as Error).message)
    }
  }

  async function handleWhatsApp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    try {
      await updateSettings({
        wa_phone_number_id: (fd.get('wa_phone_number_id') as string) || null,
        wa_access_token: (fd.get('wa_access_token') as string) || null,
        wa_verify_token: (fd.get('wa_verify_token') as string) || null,
      })
      toast.success('WhatsApp settings saved')
    } catch (err) {
      toast.error('Failed to save: ' + (err as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      {/* AI Models */}
      <form onSubmit={handleAiModels}>
        <Card>
          <CardHeader>
            <CardTitle>AI Models</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anthropic_api_key">Anthropic API Key</Label>
              <PasswordInput
                id="anthropic_api_key"
                name="anthropic_api_key"
                defaultValue={settings?.anthropic_api_key}
                placeholder="sk-ant-..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voyage_api_key">Voyage API Key</Label>
              <PasswordInput
                id="voyage_api_key"
                name="voyage_api_key"
                defaultValue={settings?.voyage_api_key}
                placeholder="pa-..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_llm_model">Default LLM Model</Label>
              <Input
                id="default_llm_model"
                name="default_llm_model"
                defaultValue={settings?.default_llm_model ?? ''}
                placeholder="claude-3-5-sonnet-20241022"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit">Save</Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Experience */}
      <form onSubmit={handleExperience}>
        <Card>
          <CardHeader>
            <CardTitle>Experience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="experience_auto_generation">Auto Generation</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically generate experience entries from conversations
                </p>
              </div>
              <Switch
                id="experience_auto_generation"
                checked={autoGen}
                onCheckedChange={setAutoGen}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="experience_dedup_threshold">Deduplication Threshold</Label>
              <Input
                id="experience_dedup_threshold"
                name="experience_dedup_threshold"
                type="number"
                step="0.01"
                min="0"
                max="1"
                defaultValue={settings?.experience_dedup_threshold ?? 0.85}
              />
              <p className="text-xs text-muted-foreground">
                Similarity score (0–1) above which entries are considered duplicates
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit">Save</Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* WhatsApp Defaults */}
      <form onSubmit={handleWhatsApp}>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wa_phone_number_id">Phone Number ID</Label>
              <Input
                id="wa_phone_number_id"
                name="wa_phone_number_id"
                defaultValue={settings?.wa_phone_number_id ?? ''}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_access_token">Access Token</Label>
              <PasswordInput
                id="wa_access_token"
                name="wa_access_token"
                defaultValue={settings?.wa_access_token}
                placeholder="EAAb..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_verify_token">Verify Token</Label>
              <Input
                id="wa_verify_token"
                name="wa_verify_token"
                defaultValue={settings?.wa_verify_token ?? ''}
                placeholder="my-verify-token"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit">Save</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
