import { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from './types';

export const APP_DEEP_LINK_SCHEME = 'mahjongfan';
export const APP_DEEP_LINK_PREFIX = `${APP_DEEP_LINK_SCHEME}://`;

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [APP_DEEP_LINK_PREFIX],
  config: {
    screens: {
      JoinInvite: 'join',
    },
  },
};
