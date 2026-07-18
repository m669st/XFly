import { useFocusable, type UseFocusableConfig } from '@noriginmedia/norigin-spatial-navigation'
import { sfxMove, sfxSelect } from './sfx'
import { hadRecentInput } from './intent'

export function useFocus<P extends object = object>(config: UseFocusableConfig<P> = {}) {
  const { onFocus, onEnterPress, ...rest } = config

  const { ref, focused, focusSelf, hasFocusedChild, focusKey } = useFocusable<P, any>({
    ...rest,
    onFocus: (layout, props, details) => {
      // Only the user's own navigation clicks — a focus the app moved itself (boot
      // auto-select, restoring focus after a panel closes) stays silent.
      if (hadRecentInput()) sfxMove()
      ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      onFocus?.(layout, props, details)
    },
    onEnterPress: onEnterPress
      ? (props, details) => {
          sfxSelect()
          onEnterPress(props, details)
        }
      : undefined,
  })

  return {
    focused,
    hasFocusedChild,
    focusKey,
    focusSelf,
    props: { ref, 'data-focused': focused },
  }
}

export { FocusContext, setFocus } from '@noriginmedia/norigin-spatial-navigation'
