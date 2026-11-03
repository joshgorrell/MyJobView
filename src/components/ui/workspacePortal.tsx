import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function createWorkspacePortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null) {
  return createPortal(<div className="theme-workspace">{children}</div>, container, key);
}
