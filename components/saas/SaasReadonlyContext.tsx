import { createContext, useContext } from 'react';

export const SaasReadonlyContext = createContext(false);

export const useSaasReadonly = () => useContext(SaasReadonlyContext);
