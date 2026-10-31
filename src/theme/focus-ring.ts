import { useState } from 'react';

/**
 * Visible focus for hardware keyboards and Switch Access (WCAG 2.4.7). iOS Full Keyboard Access
 * draws its own ring; Android doesn't, so components draw a 2 pt ring in colors.focus.
 */
export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    focusProps: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
  };
}
