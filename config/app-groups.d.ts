export type AppGroups = {
  variant: 'staging' | 'production';
  bundleId: string;
  appGroup: string;
  sharedKeychainGroup: string;
  appKeychainGroup: string;
};
export function appGroupsFor(appVariant: string | undefined): AppGroups;
