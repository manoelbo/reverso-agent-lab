import type { JSX, ReactNode } from "react"
import * as React from "react"

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block"
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context"
import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from "@/components/ai-elements/jsx-preview"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PlanAction,
  Plan,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan"
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources"
import { StackTrace, StackTraceContent, StackTraceFrames, StackTraceHeader } from "@/components/ai-elements/stack-trace"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import {
  Terminal,
  TerminalContent,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FileTextIcon } from "lucide-react"

import {
  footerContext,
  scenarioExecution,
  scenarioFailure,
  scenarioFullCycle,
  scenarioIntro,
  scenarioPlan,
} from "@/mock/chat-panel-mocks"

type ChatPanelProps = {
  title: string
  description: string
  body: ReactNode
}

const onSubmitPrompt = (message: PromptInputMessage): void => {
  void message
}

const onSuggestionClick = (suggestion: string): void => {
  void suggestion
}

const ChatPanelFooter = (): JSX.Element => (
  <PromptInputProvider>
    <PromptInput onSubmit={onSubmitPrompt}>
      <PromptInputBody>
        <PromptInputTextarea placeholder="Pergunte para o agente..." />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools className="ml-auto">
          <Context
            maxTokens={footerContext.maxTokens}
            usage={footerContext.usage as never}
            usedTokens={footerContext.usedTokens}
          >
            <ContextTrigger />
            <ContextContent>
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextOutputUsage />
                <ContextReasoningUsage />
                <ContextCacheUsage />
              </ContextContentBody>
              <ContextContentFooter />
            </ContextContent>
          </Context>
        </PromptInputTools>
        <PromptInputSubmit status="ready" />
      </PromptInputFooter>
    </PromptInput>
  </PromptInputProvider>
)

const ChatPanel = ({ title, description, body }: ChatPanelProps): JSX.Element => (
  <section className="flex h-full flex-col rounded-lg border bg-card">
    <header className="border-b px-4 py-3">
      <h2 className="font-semibold text-base">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </header>
    <div className="flex-1 space-y-4 overflow-auto px-4 py-4">{body}</div>
    <footer className="px-4 py-3">
      <ChatPanelFooter />
    </footer>
  </section>
)

const ScenarioOneBody = (): JSX.Element => (
  <>
    <Message from="user">
      <MessageContent>{scenarioIntro.user}</MessageContent>
    </Message>
    <Message from="assistant">
      <MessageContent>
        <MessageResponse>{scenarioIntro.assistant}</MessageResponse>
      </MessageContent>
    </Message>
    <Suggestions>
      {scenarioIntro.suggestions.map((suggestion) => (
        <Suggestion
          key={suggestion}
          onClick={onSuggestionClick}
          suggestion={suggestion}
        />
      ))}
    </Suggestions>
  </>
)

const ScenarioTwoBody = (): JSX.Element => (
  <>
    <Plan defaultOpen>
      <PlanHeader>
        <div className="space-y-2">
          <PlanTitle>{scenarioPlan.planTitle}</PlanTitle>
          <PlanDescription>{scenarioPlan.planDescription}</PlanDescription>
        </div>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent>
        <p className="text-muted-foreground text-sm">
          Etapas: consolidar contexto, cruzar eventos, validar alegacoes e
          preparar plano de inquiry.
        </p>
      </PlanContent>
      <PlanFooter className="justify-end">
        <PlanAction>
          <Button size="sm">Build</Button>
        </PlanAction>
      </PlanFooter>
    </Plan>
    <Queue>
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={scenarioPlan.queueMessages.length}
            label="Queued"
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {scenarioPlan.queueMessages.map((item) => (
              <QueueItem key={item}>
                <div className="flex items-center gap-2">
                  <QueueItemIndicator />
                  <QueueItemContent>{item}</QueueItemContent>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={scenarioPlan.queueTodos.length}
            label="Todo"
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {scenarioPlan.queueTodos.map((item) => (
              <QueueItem key={item}>
                <div className="flex items-center gap-2">
                  <QueueItemIndicator />
                  <QueueItemContent>{item}</QueueItemContent>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
    <Reasoning defaultOpen isStreaming={false}>
      <ReasoningTrigger />
      <ReasoningContent>{scenarioPlan.reasoning}</ReasoningContent>
    </Reasoning>
  </>
)

const ScenarioThreeBody = (): JSX.Element => (
  <>
    <Tool defaultOpen>
      <ToolHeader
        state="output-available"
        title="document_process"
        type="tool-document_process"
      />
      <ToolContent>
        <ToolInput input={scenarioExecution.toolInput} />
        <ToolOutput errorText={undefined} output={scenarioExecution.toolOutput} />
      </ToolContent>
    </Tool>
    <Sources>
      <SourcesTrigger count={scenarioExecution.sources.length} />
      <SourcesContent>
        {scenarioExecution.sources.map((source) => (
          <Source href={source.href} key={source.href} title={source.title} />
        ))}
      </SourcesContent>
    </Sources>
    <CodeBlock code={scenarioExecution.generatedMarkdown} language="markdown">
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileTextIcon className="size-4" />
          <CodeBlockFilename>finding-preview.md</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
    <JSXPreview
      isStreaming={false}
      jsx={scenarioExecution.jsxPreview}
      onError={(error) => {
        console.error("JSX Preview parse error", error)
      }}
    >
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  </>
)

const ScenarioFourBody = (): JSX.Element => (
  <>
    <Tool defaultOpen>
      <ToolHeader
        state="output-error"
        title="persist_finding"
        type="tool-persist_finding"
      />
      <ToolContent>
        <ToolInput input={{ findingId: "finding-019-01", mode: "verify" }} />
        <ToolOutput errorText={scenarioFailure.toolError} output={undefined} />
      </ToolContent>
    </Tool>
    <StackTrace defaultOpen trace={scenarioFailure.stackTrace}>
      <StackTraceHeader />
      <StackTraceContent>
        <StackTraceFrames />
      </StackTraceContent>
    </StackTrace>
    <Terminal isStreaming={false} output={scenarioFailure.terminalOutput}>
      <TerminalHeader>
        <TerminalTitle>Agent Runtime</TerminalTitle>
        <TerminalStatus />
      </TerminalHeader>
      <TerminalContent />
    </Terminal>
  </>
)

const ScenarioFiveBody = (): JSX.Element => (
  <>
    <Message from="assistant">
      <MessageContent>
        <MessageResponse>
          {`### Resumo do ciclo\n\n${scenarioFullCycle.finalSummary
            .map((line) => `- ${line}`)
            .join("\n")}`}
        </MessageResponse>
      </MessageContent>
    </Message>
    <Plan defaultOpen>
      <PlanHeader>
        <div className="space-y-2">
          <PlanTitle>Ciclo completo PEV</PlanTitle>
          <PlanDescription>
            Consolidacao de etapas plan, execute e verify com rastreabilidade.
          </PlanDescription>
        </div>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent className="text-muted-foreground text-sm">
        1) Leitura de evidencias. 2) Execucao de tools. 3) Verificacao de
        confianca. 4) Persistencia parcial.
      </PlanContent>
    </Plan>
    <Queue>
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel count={2} label="Queued" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>
              <div className="flex items-center gap-2">
                <QueueItemIndicator />
                <QueueItemContent>Cruzar timelines do dossie</QueueItemContent>
              </div>
            </QueueItem>
            <QueueItem>
              <div className="flex items-center gap-2">
                <QueueItemIndicator />
                <QueueItemContent>Revalidar finding bloqueado</QueueItemContent>
              </div>
            </QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
    <Reasoning defaultOpen isStreaming={false}>
      <ReasoningTrigger />
      <ReasoningContent>{scenarioFullCycle.loopReasoning}</ReasoningContent>
    </Reasoning>
    <Tool defaultOpen>
      <ToolHeader
        state="output-available"
        title="verify_evidence_gate"
        type="tool-verify_evidence_gate"
      />
      <ToolContent>
        <ToolInput
          input={{ findingsReady: 2, findingsBlocked: 1, threshold: "high" }}
        />
        <ToolOutput
          errorText={undefined}
          output={{ confidence: 0.82, result: "partial_pass" }}
        />
      </ToolContent>
    </Tool>
    <Sources>
      <SourcesTrigger count={2} />
      <SourcesContent>
        <Source
          href="https://www.gov.br/acessoainformacao"
          title="Lei de Acesso a Informacao"
        />
        <Source
          href="https://www.planalto.gov.br"
          title="Legislacao Federal"
        />
      </SourcesContent>
    </Sources>
  </>
)

export default function ChatPanelsReference(): JSX.Element {
  return (
    <TooltipProvider>
      <div className="h-full overflow-auto">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              ChatPainel AI Elements — Reference
            </h1>
            <p className="text-muted-foreground text-sm">
              5 cenarios estaticos usando os componentes base do AI Elements.
            </p>
          </header>

          <div className="h-[90vh]">
            <ChatPanel
              body={<ScenarioOneBody />}
              description="Conversa inicial com resposta do agente e sugestoes de prompt."
              title="Cenario 1: Conversa inicial"
            />
          </div>
          <div className="h-[90vh]">
            <ChatPanel
              body={<ScenarioTwoBody />}
              description="Planejamento com plan, queue e reasoning no mesmo fluxo."
              title="Cenario 2: Planejamento investigativo"
            />
          </div>
          <div className="h-[90vh]">
            <ChatPanel
              body={<ScenarioThreeBody />}
              description="Execucao com tool, fontes, markdown gerado e preview JSX."
              title="Cenario 3: Execucao com evidencias"
            />
          </div>
          <div className="h-[90vh]">
            <ChatPanel
              body={<ScenarioFourBody />}
              description="Falha simulada com diagnostico de erro e terminal."
              title="Cenario 4: Falha e diagnostico"
            />
          </div>
          <div className="h-[90vh]">
            <ChatPanel
              body={<ScenarioFiveBody />}
              description="Ciclo completo PEV sintetizado em um unico painel."
              title="Cenario 5: Ciclo completo"
            />
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
