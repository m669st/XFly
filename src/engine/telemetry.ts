import { addPatch } from './patcher'

/**
 * Stop the page reporting on the player.
 *
 * xCloud's telemetry provider builds itself with every track* method wired up, then
 * ships events for page views, http calls, errors and user actions for the whole
 * session. None of it is needed to stream a game. The provider is still constructed
 * — code all over the page calls into it and would throw otherwise — but every way
 * out of it is a no-op.
 *
 * The anchor is the line that turns lightweight telemetry on, which runs inside the
 * provider's own constructor: the one place where `this` is the provider and the
 * methods are about to be used.
 */
const ANCHOR = 'this.enableLightweightTelemetry=!'

const SILENCED = [
  'trackEvent',
  'trackPageView',
  'trackHttpCompleted',
  'trackHttpFailed',
  'trackError',
  'trackErrorLike',
  'onTrackEvent',
]

addPatch({
  name: 'noTelemetry',
  anchor: ANCHOR,

  apply(src) {
    const noop = SILENCED.map((m) => `this.${m}=`).join('') + '()=>{};'
    const out = src.replace(ANCHOR, noop + ANCHOR)
    return out === src ? null : out
  },
})
