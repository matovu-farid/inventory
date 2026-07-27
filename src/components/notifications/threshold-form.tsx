import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { InfoTip } from '#/components/ui/info-tip'
import type { HelpKey } from '#/lib/help-dictionary'

export interface ThresholdValue {
  mode: 'percent' | 'units'
  value: number
}

export function ThresholdField({
  label,
  helpText,
  value,
  onChange,
  modeHelpKey,
  valueHelpKey,
}: {
  label: string
  helpText: string
  value: ThresholdValue
  onChange: (next: ThresholdValue) => void
  modeHelpKey: HelpKey
  valueHelpKey: HelpKey
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
      </div>
      <p className="text-xs text-muted-foreground">{helpText}</p>
      <div className="flex gap-2">
        <div className="flex items-center gap-1">
          <Select
            value={value.mode}
            onValueChange={(m) =>
              onChange({
                mode: m as ThresholdValue['mode'],
                value: value.value,
              })
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percentage</SelectItem>
              <SelectItem value="units">Units</SelectItem>
            </SelectContent>
          </Select>
          <InfoTip term={modeHelpKey} />
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            step="1"
            value={value.value}
            onChange={(e) =>
              onChange({ mode: value.mode, value: Number(e.target.value) })
            }
            className="w-32"
          />
          <InfoTip term={valueHelpKey} />
        </div>
        <span className="self-center text-sm text-muted-foreground">
          {value.mode === 'percent' ? '% of typical batch' : 'units left'}
        </span>
      </div>
    </div>
  )
}

// Re-export Button so consumers of this file don't need a separate import
export { Button }
