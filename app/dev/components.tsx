import { Redirect } from 'expo-router';

import { ComponentGallery } from '@/features/dev/components/component-gallery';

// Hidden developer screen: open replywise://dev/components in a development build.
export default function DevComponents() {
  if (!__DEV__) return <Redirect href="/" />;
  return <ComponentGallery />;
}
