import { getSettings } from '@/actions/settings'
import { SettingsForm } from '@/components/settings/settings-form'

export default async function SettingsPage() {
  const settings = await getSettings()

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure API keys, AI models, and default settings.
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  )
}
