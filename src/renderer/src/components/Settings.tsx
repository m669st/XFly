import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Screen } from './Screen'
import { useFocus, FocusContext } from '../lib/focus'
import { t, fmt } from '../lib/i18n'

const TABS = ['video', 'region', 'controller', 'advanced'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  video: t.settings.tabVideo,
  region: t.settings.tabRegion,
  controller: t.settings.tabController,
  advanced: t.settings.tabAdvanced,
}

export function Settings(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [local, setLocal] = useState<Record<string, any>>(settings)
  const [tab, setTab] = useState<Tab>('video')

  useEffect(() => setLocal(settings), [settings])

  const update = async (key: string, value: unknown): Promise<void> => {
    setLocal((l) => ({ ...l, [key]: value }))
    const all = await window.xfly.setSetting(key, value)
    setSettings(all)
  }

  return (
    <Screen title={t.nav.settings}>
      <div className="flex gap-10">
        <Tabs tab={tab} onTab={setTab} />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-4">
          {tab === 'video' && <Video local={local} update={update} />}
          {tab === 'region' && <Region local={local} update={update} />}
          {tab === 'controller' && <Controller local={local} update={update} />}
          {tab === 'advanced' && <Advanced local={local} update={update} />}
        </div>
      </div>
    </Screen>
  )
}

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }): JSX.Element {
  const { focusKey, props } = useFocus({ focusKey: 'SETTINGS_TABS', trackChildren: true, saveLastFocusedChild: true })
  return (
    <FocusContext.Provider value={focusKey}>
      <nav {...props} className="flex w-52 shrink-0 flex-col gap-1">
        {TABS.map((key) => (
          <TabButton key={key} label={TAB_LABEL[key]} active={tab === key} onPress={() => onTab(key)} />
        ))}
      </nav>
    </FocusContext.Provider>
  )
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): JSX.Element {
  const { props } = useFocus({ onEnterPress: onPress, onFocus: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable rounded-lg px-4 py-2.5 text-left text-[13px] transition ${
        active ? 'bg-xbox/20 font-semibold text-white shadow-[inset_3px_0_0_#9BF00B]' : 'text-ink-2 hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  )
}

type P = { local: Record<string, any>; update: (k: string, v: unknown) => void }

function Video({ local, update }: P): JSX.Element {
  const enhancer = (local.videoEnhancer as string) ?? 'xfly'
  return (
    <>
      <SegmentRow
        label={t.settings.resolution}
        hint={t.settings.resolutionHint}
        value={(local.resolutionAlias as string) ?? 'Auto'}
        onChange={(v) => update('resolutionAlias', v)}
        options={[['Auto', t.common.auto], ['1440', '1440p'], ['1080HQ', '1080p HQ'], ['1080', '1080p'], ['720HQ', '720p HQ']]}
      />
      <Bitrate value={(local.targetBitrateMbps as number) ?? 20} onChange={(v) => update('targetBitrateMbps', v)} />
      <Enhancer value={enhancer} onChange={(v) => update('videoEnhancer', v)} />
      {enhancer === 'xfly' && (
        <>
          <Slider label={t.settings.deblock} value={local.deblock ?? 3} min={0} max={5} onChange={(v) => update('deblock', v)} />
          <Slider label={t.settings.dering} value={local.dering ?? 2} min={0} max={5} onChange={(v) => update('dering', v)} />
          <Slider label={t.settings.sharpen} value={local.claritySharpen ?? 1} min={0} max={5} onChange={(v) => update('claritySharpen', v)} />
          <Slider label={t.settings.clarityBoost} value={local.clarityBoost ?? 1} min={0} max={5} onChange={(v) => update('clarityBoost', v)} />
        </>
      )}
    </>
  )
}

function Region({ local, update }: P): JSX.Element {
  const regions = useStore((s) => s.regions)
  const code = (r: { baseUri: string; name: string }): string => r.baseUri?.match(/\/\/(\w+)\./)?.[1] ?? r.name

  if (!regions.length) {
    return (
      <Row label={t.settings.server} hint={t.settings.serverHintEmpty}>
        <span className="text-[12px] text-ink-3">—</span>
      </Row>
    )
  }
  const options: [string, string][] = [
    ['auto', t.common.auto],
    ...regions.map((r) => [code(r), `${r.name}${r.isDefault ? t.settings.serverDefault : ''}`] as [string, string]),
  ]
  const value = (local.streamRegion as string) ?? 'auto'
  return (
    <Row label={t.settings.server} hint={t.settings.serverHint} onArrow={listArrows(value, options, (v) => update('streamRegion', v))}>
      <Dropdown value={value} onChange={(v) => update('streamRegion', v)} options={options} />
    </Row>
  )
}

function Controller({ local, update }: P): JSX.Element {
  return (
    <>
      <SegmentRow
        label={t.settings.vibration}
        value={local.vibration !== false ? 'on' : 'off'}
        onChange={(v) => update('vibration', v === 'on')}
        options={[['on', t.common.on], ['off', t.common.off]]}
      />
      <SegmentRow
        label={t.settings.micOn}
        value={local.micDefaultOn ? 'on' : 'off'}
        onChange={(v) => update('micDefaultOn', v === 'on')}
        options={[['on', t.common.on], ['off', t.common.off]]}
      />
    </>
  )
}

function Advanced({ local, update }: P): JSX.Element {
  return (
    <>
      <SegmentRow
        label={t.settings.adaptiveSharpen}
        hint={t.settings.adaptiveSharpenHint}
        value={local.clarityAdaptive !== false ? 'on' : 'off'}
        onChange={(v) => update('clarityAdaptive', v === 'on')}
        options={[['on', t.common.on], ['off', t.common.off]]}
      />
      <Diagnostics />
      <Quit />
    </>
  )
}

function Row({
  label,
  hint,
  children,
  onArrow,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  onArrow?: (dir: string) => boolean
}): JSX.Element {
  const { focused, props } = useFocus({ onArrowPress: onArrow })
  return (
    <div
      {...props}
      className={`focusable flex items-center justify-between gap-6 rounded-xl border px-4 py-3.5 transition ${
        focused ? 'border-velocity bg-xbox/[0.13]' : 'border-line bg-bg-2'
      }`}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function listArrows(
  value: string,
  options: [string, string][],
  onChange: (v: string) => void,
): (dir: string) => boolean {
  return (dir) => {
    const i = options.findIndex(([v]) => v === value)
    if (i < 0) return true
    if (dir === 'left' && i > 0) {
      onChange(options[i - 1][0])
      return false
    }
    if (dir === 'right' && i < options.length - 1) {
      onChange(options[i + 1][0])
      return false
    }
    return true
  }
}

function numberArrows(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
): (dir: string) => boolean {
  return (dir) => {
    if (dir === 'left' && value > min) {
      onChange(Math.max(min, value - step))
      return false
    }
    if (dir === 'right' && value < max) {
      onChange(Math.min(max, value + step))
      return false
    }
    return true
  }
}

function SegmentRow({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  options: [string, string][]
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <Row label={label} hint={hint} onArrow={listArrows(value, options, onChange)}>
      <Segments value={value} onChange={onChange} options={options} />
    </Row>
  )
}

function Segments({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}): JSX.Element {
  return (
    <div className="flex gap-1.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition ${
            value === v ? 'bg-xbox text-white' : 'bg-white/[0.06] text-ink-2 hover:bg-white/[0.12]'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function Dropdown({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-bg-3 px-3 py-2 text-[12.5px] outline-none"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

function Bitrate({ value, onChange }: { value: number; onChange: (v: number) => void }): JSX.Element {
  const { focused, props } = useFocus({ onArrowPress: numberArrows(value, 0, 50, 5, onChange) })
  return (
    <div
      {...props}
      className={`focusable rounded-xl border px-4 py-3.5 transition ${
        focused ? 'border-velocity bg-xbox/[0.13]' : 'border-line bg-bg-2'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold">{t.settings.bitrate}</div>
        <div className="font-mono text-[12px] tabular-nums text-velocity">
          {value > 0 ? `${value} Mbps` : t.common.auto}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={50}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-velocity"
      />
      {(value === 0 || value > 25) && (
        <div className="mt-1 text-[11.5px] text-ink-3">
          {value === 0 ? t.settings.bitrateOff : t.settings.bitrateHigh}
        </div>
      )}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}): JSX.Element {
  const { focused, props } = useFocus({ onArrowPress: numberArrows(value, min, max, step, onChange) })
  return (
    <div
      {...props}
      className={`focusable rounded-xl border px-4 py-3.5 transition ${
        focused ? 'border-velocity bg-xbox/[0.13]' : 'border-line bg-bg-2'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold">{label}</div>
        <div className="font-mono text-[12px] tabular-nums text-velocity">
          {value}
          {unit ? ` ${unit}` : ''}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-velocity"
      />
    </div>
  )
}

function Enhancer({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [gpu, setGpu] = useState<{
    vendor: 'nvidia' | 'amd' | null
    label: string
    name: string
    idle: boolean
  } | null>(null)
  useEffect(() => {
    void window.xfly.gpu().then(setGpu).catch(() => {})
  }, [])

  const options: [string, string][] = [
    ['xfly', 'XFly'],
    ...(gpu?.vendor ? ([['vsr', gpu.label]] as [string, string][]) : []),
    ['off', t.common.off],
  ]

  return (
    <>
      <SegmentRow
        label={t.settings.enhancer}
        hint={gpu && !gpu.vendor && !gpu.idle ? fmt(t.settings.noGpuEnhancer, { gpu: gpu.name }) : undefined}
        value={value}
        onChange={onChange}
        options={options}
      />
      {value === 'vsr' && gpu?.vendor && (
        <p className="px-1 text-[11.5px] leading-relaxed text-ink-3">
          {gpu.vendor === 'amd' ? t.settings.vsrNoteAmd : t.settings.vsrNoteNvidia}
        </p>
      )}
      {gpu?.idle && (
        <p className="px-1 text-[11.5px] leading-relaxed text-yellow-300/80">
          ⚠{' '}
          <Emphasise
            text={fmt(t.settings.gpuIdle, { gpu: gpu.name, card: gpu.label })}
            bold={t.settings.gpuIdleEmphasis}
            className="text-white"
          />
        </p>
      )}
    </>
  )
}

function Emphasise({ text, bold, className }: { text: string; bold: string; className: string }): JSX.Element {
  const i = text.indexOf(bold)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <b className={className}>{bold}</b>
      {text.slice(i + bold.length)}
    </>
  )
}

function Diagnostics(): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <Row label={t.settings.diagnostics} hint={t.settings.diagnosticsHint}>
      <div className="flex gap-2">
        <Btn
          label={copied ? t.settings.copied : t.settings.errorLog}
          onPress={async () => {
            await navigator.clipboard.writeText(await window.xfly.dumpLog())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        />
        <Btn label={t.settings.recordFile} onPress={() => window.xfly.openRecording()} />
      </div>
    </Row>
  )
}

function Quit(): JSX.Element {
  return (
    <Row label={t.settings.quit}>
      <Btn label={t.settings.quitButton} danger onPress={() => window.xfly.close()} />
    </Row>
  )
}

function Btn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }): JSX.Element {
  const { props } = useFocus({ onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
        danger ? 'bg-red-500/80 text-white hover:bg-red-500' : 'bg-white/[0.08] text-white hover:bg-white/[0.16]'
      }`}
    >
      {label}
    </button>
  )
}
