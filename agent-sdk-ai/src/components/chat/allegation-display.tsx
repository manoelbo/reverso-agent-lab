'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ShieldCheckIcon } from 'lucide-react'

interface AllegationDisplayProps {
  lead: string
  verifiedFindings: number
  reviewQueue: number
  allegations?: Array<{ id: string; statement: string }>
  verifiedItems?: Array<{ id: string; claim: string }>
  reviewItems?: Array<{ id: string; claim: string }>
  onAcceptAllegation?: (allegationId: string) => void
  onRejectAllegation?: (allegationId: string) => void
  onVerifyFinding?: (findingId: string) => void
  onRejectFinding?: (findingId: string) => void
}

export function AllegationDisplay({
  lead,
  verifiedFindings,
  reviewQueue,
  allegations = [],
  verifiedItems = [],
  reviewItems = [],
  onAcceptAllegation,
  onRejectAllegation,
  onVerifyFinding,
  onRejectFinding,
}: AllegationDisplayProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-primary" />
          Resultado do Inquiry — {lead}
        </CardTitle>
        <div className="flex items-center gap-3 pt-1">
          <Badge variant="secondary" className="gap-1">
            <CheckCircleIcon className="size-3" />
            {verifiedFindings} verificados
          </Badge>
          <Badge variant="outline" className="gap-1">
            <AlertTriangleIcon className="size-3" />
            {reviewQueue} em revisão
          </Badge>
        </div>
      </CardHeader>

      {allegations.length > 0 ? (
        <CardContent className="space-y-3">
          <h4 className="text-sm font-semibold">Alegações</h4>
          {allegations.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border p-3 space-y-2"
            >
              <div className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                <p className="mt-1">{item.statement}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onAcceptAllegation?.(item.id)}
                >
                  <CheckCircleIcon className="size-3.5 mr-1" />
                  Aceitar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onRejectAllegation?.(item.id)}
                >
                  <XCircleIcon className="size-3.5 mr-1" />
                  Recusar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}

      {verifiedItems.length > 0 ? (
        <CardContent className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-green-600 dark:text-green-400">
            <CheckCircleIcon className="size-3.5" />
            Findings Verificados
          </h4>
          {verifiedItems.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-green-500/30 bg-green-500/5 p-2.5 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
              <p className="mt-0.5">{item.claim}</p>
            </div>
          ))}
        </CardContent>
      ) : null}

      {reviewItems.length > 0 ? (
        <CardContent className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangleIcon className="size-3.5" />
            Findings para Revisão
          </h4>
          {reviewItems.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2"
            >
              <div className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                <p className="mt-0.5">{item.claim}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onVerifyFinding?.(item.id)}
                >
                  <CheckCircleIcon className="size-3 mr-1" />
                  Verificar
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => onRejectFinding?.(item.id)}
                >
                  <XCircleIcon className="size-3 mr-1" />
                  Rejeitar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}

      {reviewQueue > 0 ? (
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Sugestão: revise as evidências e execute nova rodada de inquiry se necessário.
          </p>
        </CardFooter>
      ) : null}
    </Card>
  )
}
