import type { ReactElement } from 'react';

export type CustomHeaderItem = {
  type: 'custom';
  element: ReactElement;
  hidesSharedBackground: true;
};

export function createCustomHeaderItem(element: ReactElement): CustomHeaderItem {
  return {
    type: 'custom',
    element,
    hidesSharedBackground: true,
  };
}
