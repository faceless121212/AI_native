import { Platform } from 'react-native';

import { touchTarget } from './tokens';

/** 44 pt on iOS, 48 dp on Android (and 44 elsewhere). Use for minHeight and minWidth. */
export function minTouchTarget(): number {
  return Platform.OS === 'android' ? touchTarget.android : touchTarget.ios;
}
