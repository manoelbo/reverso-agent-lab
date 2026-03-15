"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleDotIcon,
  CircleIcon,
  XCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo, useState } from "react";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const ctx = useContext(ChainOfThoughtContext);
  if (!ctx) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return ctx;
};

export type ChainOfThoughtProps = ComponentProps<typeof Collapsible> & {
  defaultOpen?: boolean;
};

export const ChainOfThought = ({
  className,
  defaultOpen = false,
  children,
  ...props
}: ChainOfThoughtProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const contextValue = useMemo<ChainOfThoughtContextValue>(
    () => ({ isOpen, setIsOpen }),
    [isOpen]
  );

  return (
    <ChainOfThoughtContext.Provider value={contextValue}>
      <Collapsible
        className={cn("not-prose mb-2", className)}
        onOpenChange={setIsOpen}
        open={isOpen}
        {...props}
      >
        {children}
      </Collapsible>
    </ChainOfThoughtContext.Provider>
  );
};

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  children?: ReactNode;
};

export const ChainOfThoughtHeader = memo(
  ({ className, children, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        {children ?? (
          <>
            <CircleDotIcon className="size-3.5" />
            <span>Raciocínio do agente</span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                isOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  }
);

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => (
    <CollapsibleContent
      className={cn(
        "mt-2 space-y-1",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  )
);

type ChainOfThoughtStepStatus = "complete" | "active" | "pending" | "error";

const statusIcon: Record<ChainOfThoughtStepStatus, LucideIcon> = {
  complete: CheckCircleIcon,
  active: CircleDotIcon,
  pending: CircleIcon,
  error: XCircleIcon,
};

const statusClass: Record<ChainOfThoughtStepStatus, string> = {
  complete: "text-muted-foreground",
  active: "text-foreground",
  pending: "text-muted-foreground/50",
  error: "text-destructive",
};

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: string;
  description?: string;
  status?: ChainOfThoughtStepStatus;
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: IconProp,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    const Icon = IconProp ?? statusIcon[status];

    return (
      <div
        className={cn(
          "flex flex-col gap-0.5 py-0.5 text-xs",
          statusClass[status],
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" />
          <span className="font-medium">{label}</span>
        </div>
        {description && (
          <p className="ml-5 text-muted-foreground/70">{description}</p>
        )}
        {children}
      </div>
    );
  }
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
