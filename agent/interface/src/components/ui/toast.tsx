import * as React from "react"
import { Toast as ToastPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function ToastProvider(props: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed top-4 right-4 z-[100] flex max-h-screen w-[360px] flex-col gap-2 outline-none",
        className
      )}
      {...props}
    />
  )
}

function Toast(props: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return <ToastPrimitive.Root data-slot="toast" {...props} />
}

function ToastTitle(props: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className="text-sm font-semibold"
      {...props}
    />
  )
}

function ToastDescription(
  props: React.ComponentProps<typeof ToastPrimitive.Description>
) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className="text-xs text-muted-foreground"
      {...props}
    />
  )
}

function ToastClose(props: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-lg border bg-background p-4 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out",
        className
      )}
      {...props}
    />
  )
}

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastContent,
}
