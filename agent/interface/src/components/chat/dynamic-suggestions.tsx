import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion"

export interface DynamicSuggestionsProps {
  items: Array<{ id: string; text: string }>
  onSelect: (text: string) => void
}

export function DynamicSuggestions({ items, onSelect }: DynamicSuggestionsProps) {
  if (items.length === 0) return null

  return (
    <div className="mt-3">
      <Suggestions>
        {items.map((item) => (
          <Suggestion key={item.id} suggestion={item.text} onClick={onSelect} />
        ))}
      </Suggestions>
    </div>
  )
}
