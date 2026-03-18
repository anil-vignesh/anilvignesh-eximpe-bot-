'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusIcon } from 'lucide-react'
import { createStore } from '@/actions/experience-store'
import { toast } from 'sonner'

export function NewStoreForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    startTransition(async () => {
      try {
        const id = await createStore({
          name: name.trim(),
          description: description.trim() || undefined,
          is_shared: isShared,
        })
        toast.success('Experience store created')
        setOpen(false)
        setName('')
        setDescription('')
        setIsShared(false)
        router.push(`/experience-store/${id}`)
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to create store')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        New Store
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Experience Store</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="store-name">Name</Label>
              <Input
                id="store-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Support"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-description">Description (optional)</Label>
              <Input
                id="store-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description…"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="store-shared"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="size-4 rounded border-border"
              />
              <Label htmlFor="store-shared">Shared store (available to all bots)</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !name.trim()}>
                {isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
