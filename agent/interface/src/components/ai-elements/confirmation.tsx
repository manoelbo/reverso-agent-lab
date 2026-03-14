import { cn } from "@/lib/utils"
import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, useContext } from "react"
import { Button } from "@/components/ui/button"

type ConfirmationState = "approval-requested" | "approved" | "rejected"

interface ConfirmationContextValue {
  state: ConfirmationState
  approvalId: string
}

const ConfirmationContext = createContext<ConfirmationContextValue>({
  state: "approval-requested",
  approvalId: "",
})

export interface ConfirmationProps extends ComponentProps<"div"> {
  approval: { id: string }
  state: ConfirmationState
  children?: ReactNode
}

export function Confirmation({ approval, state, className, children, ...props }: ConfirmationProps) {
  return (
    <ConfirmationContext.Provider value={{ state, approvalId: approval.id }}>
      <div
        className={cn(
          "not-prose mb-4 w-full rounded-md border",
          state === "approved" && "border-green-500/30 bg-green-500/5",
          state === "rejected" && "border-destructive/30 bg-destructive/5",
          state === "approval-requested" && "border-amber-500/40 bg-amber-500/5",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ConfirmationContext.Provider>
  )
}

export function ConfirmationTitle({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-start gap-3 p-4", className)} {...props}>
      <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  )
}

export function ConfirmationRequest({ className, children, ...props }: ComponentProps<"div">) {
  const { state } = useContext(ConfirmationContext)
  if (state !== "approval-requested") return null
  return (
    <div className={cn("text-foreground", className)} {...props}>
      {children}
    </div>
  )
}

export function ConfirmationAccepted({ className, children, ...props }: ComponentProps<"div">) {
  const { state } = useContext(ConfirmationContext)
  if (state !== "approved") return null
  return (
    <div className={cn("flex items-center gap-2 text-green-600 dark:text-green-400", className)} {...props}>
      {children}
    </div>
  )
}

export function ConfirmationRejected({ className, children, ...props }: ComponentProps<"div">) {
  const { state } = useContext(ConfirmationContext)
  if (state !== "rejected") return null
  return (
    <div className={cn("flex items-center gap-2 text-destructive", className)} {...props}>
      {children}
    </div>
  )
}

export function ConfirmationActions({ className, children, ...props }: ComponentProps<"div">) {
  const { state } = useContext(ConfirmationContext)
  if (state !== "approval-requested") return null
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-t border-amber-500/20 px-4 py-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export type ConfirmationActionProps = ComponentProps<typeof Button>

export function ConfirmationAction({ className, ...props }: ConfirmationActionProps) {
  return <Button size="sm" className={cn(className)} {...props} />
}

export { CheckIcon, XIcon }
