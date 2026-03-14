import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  /** Renderiza erro compacto inline (para partes de mensagem) em vez do overlay de tela cheia */
  inline?: boolean
}

interface State {
  hasError: boolean
  message?: string
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : "Erro inesperado na interface"
    return { hasError: true, message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ChatErrorBoundary]", error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div className="my-1 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span>⚠</span>
            <span>Erro ao renderizar este conteúdo</span>
          </div>
        )
      }

      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold">Algo deu errado</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.message}
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
