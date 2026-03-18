import { Badge } from "@/components/ui/badge"

type StatusBadgeVariant = 'pending' | 'processing' | 'indexed' | 'error' | 'active' | 'archived' | 'flagged'

const statusConfig: Record<StatusBadgeVariant, { label: string; variant: 'gray' | 'blue' | 'success' | 'destructive' | 'warning' | 'purple' }> = {
  pending: { label: 'Pending', variant: 'gray' },
  processing: { label: 'Processing', variant: 'blue' },
  indexed: { label: 'Indexed', variant: 'success' },
  error: { label: 'Error', variant: 'destructive' },
  active: { label: 'Active', variant: 'success' },
  archived: { label: 'Archived', variant: 'gray' },
  flagged: { label: 'Flagged', variant: 'warning' },
}

interface StatusBadgeProps {
  status: StatusBadgeVariant
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: 'gray' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
