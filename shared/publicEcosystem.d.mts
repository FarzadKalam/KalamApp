export type EcosystemStatus = 'technology' | 'supported' | 'development';
export interface EcosystemItem {
  id: string;
  name: string;
  description: string;
  status: EcosystemStatus;
  logo?: string;
  icon?: string;
}
export interface EcosystemGroup {
  id: string;
  title: string;
  caption: string;
  description: string;
  radius: number;
  duration: number;
  reverse: boolean;
  items: EcosystemItem[];
}
export const ECOSYSTEM_STATUS_LABELS: Record<EcosystemStatus, string>;
export const PUBLIC_ECOSYSTEM_GROUPS: EcosystemGroup[];
