import { createContext } from 'react';

export const DashboardLayoutContext = createContext({
  editing: false,
  move: (_id: string, _direction: number) => {},
});

