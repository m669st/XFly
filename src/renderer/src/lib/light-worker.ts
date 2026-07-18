import { createLightRig, type RigHandle } from './light-rig'

/**
 * The light rig's home thread.
 *
 * The main thread hands over the three canvases once and then only ever sends it a new
 * colour, a new aim, or a new size — a handful of messages a minute. Everything that
 * used to stall the opening (baking the cones, simulating and drawing the dust, the
 * aiming spring) happens here instead, so no amount of work on the main thread — image
 * decodes, library merges, launching a game — can put a hitch in the animation.
 */

type Incoming =
  | {
      type: 'init'
      shade: OffscreenCanvas
      light: OffscreenCanvas
      dust: OffscreenCanvas
      w: number
      h: number
      dpr: number
      rgb: string
      aim: number
      iris: number
      reduced: boolean
    }
  | { type: 'colour'; rgb: string }
  | { type: 'target'; aim: number; iris: number }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'reduced'; v: boolean }
  | { type: 'destroy' }

let rig: RigHandle | null = null

// Announce that this thread actually started. The main thread waits for this before
// handing over the canvases — transferring is irreversible, so if a worker cannot run
// here (a blocked origin, say) it must find out while the canvases are still usable.
self.postMessage({ type: 'ready' })

self.onmessage = (e: MessageEvent<Incoming>): void => {
  const m = e.data
  switch (m.type) {
    case 'init':
      rig?.destroy()
      rig = createLightRig(m.shade, m.light, m.dust, {
        w: m.w,
        h: m.h,
        dpr: m.dpr,
        rgb: m.rgb,
        aim: m.aim,
        iris: m.iris,
        reduced: m.reduced,
      })
      break
    case 'colour':
      rig?.colour(m.rgb)
      break
    case 'target':
      rig?.target(m.aim, m.iris)
      break
    case 'resize':
      rig?.resize(m.w, m.h, m.dpr)
      break
    case 'reduced':
      rig?.setReduced(m.v)
      break
    case 'destroy':
      rig?.destroy()
      rig = null
      break
  }
}
