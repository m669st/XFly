import { app } from 'electron'
import { diagWrite } from './diag'

const VENDOR_NVIDIA = 0x10de
const VENDOR_AMD = 0x1002

export type GpuVendor = 'nvidia' | 'amd'

export interface GpuInfo {
  vendor: GpuVendor | null
  label: string
  name: string
  driver: string
  idle: boolean
}

let cached: GpuInfo | null = null

const NVIDIA_CAPABLE = /\bRTX\b/i

const AMD_CAPABLE = /\bRX\s*[79]\d{3}\b/i

export async function gpuInfo(): Promise<GpuInfo> {
  if (cached) return cached
  let info: GpuInfo = { vendor: null, label: '', name: 'unknown', driver: '', idle: false }
  try {
    const raw = (await app.getGPUInfo('complete')) as any
    const devices: any[] = raw?.gpuDevice ?? []
    const renderer: string = raw?.auxAttributes?.glRenderer || devices.find((d) => d?.active)?.deviceString || devices[0]?.deviceString || 'unknown'

    const find = (vendorId: number, capable: RegExp) => {
      const dev = devices.find((d) => d?.vendorId === vendorId)
      const name: string = dev?.deviceString || ''
      const own = capable.test(name)
      const viaRenderer = !name && capable.test(renderer)
      return {
        present: !!dev,
        capable: own || viaRenderer,
        active: !!dev?.active || new RegExp(vendorId === VENDOR_NVIDIA ? 'nvidia' : 'amd|radeon', 'i').test(renderer),
        driver: dev?.driverVersion || '',
      }
    }

    const nv = find(VENDOR_NVIDIA, NVIDIA_CAPABLE)
    const amd = find(VENDOR_AMD, AMD_CAPABLE)

    const pick: [GpuVendor, typeof nv, string][] = [
      ['nvidia', nv, 'NVIDIA RTX'],
      ['amd', amd, 'AMD Radeon'],
    ]
    const chosen = pick.find(([, g]) => g.capable)
    if (chosen) {
      const [vendor, g, label] = chosen
      info = {
        vendor,
        label,
        name: renderer,
        driver: g.driver || raw?.auxAttributes?.gpuDriverVersion || '',
        idle: !g.active,
      }
    } else {
      info = {
        vendor: null,
        label: '',
        name: renderer,
        driver: raw?.auxAttributes?.gpuDriverVersion || '',
        idle: false,
      }
    }
  } catch (e) {
    diagWrite('gpu', `detection failed: ${e}`)
  }
  cached = info
  diagWrite(
    'gpu',
    `enhancer=${info.vendor ?? 'none'} idle=${info.idle} rendering-on=${info.name} driver=${info.driver || '?'}`,
  )
  return info
}
