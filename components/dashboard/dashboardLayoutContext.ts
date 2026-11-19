import { createContext } from 'react';

export const DashboardLayoutContext = createContext({
  editing: false,
  setPreview: (_size: { id: string; width: number } | null) => {},
  move: (_id: string, _direction: number) => {},
});

