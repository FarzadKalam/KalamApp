import React, { useId } from 'react';
import { getAgentDefinition, type AgentKey } from '../../utils/aiAgentCatalog';

export type AiAgentIconProps = {
  agentKey?: AgentKey | string | null;
  iconKey?: string | null;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
};

const ICON_TO_AGENT_KEY: Record<string, AgentKey> = {
  compass: 'lead_orchestrator',
  shopping: 'sales_leads',
  truck: 'purchase_supply',
  customer: 'customer_response',
  hr: 'hr_manager',
  calendar: 'reservation',
  workflow: 'project_process',
  instagram: 'instagrammer',
  guide: 'system_guide',
};

const resolveVectorAgentKey = (agentKey?: string | null, iconKey?: string | null): AgentKey | 'default' => {
  const directAgent = String(agentKey || '').trim().toLowerCase() as AgentKey;
  if (directAgent && Object.values(ICON_TO_AGENT_KEY).includes(directAgent)) {
    return directAgent;
  }
  const directIcon = String(iconKey || '').trim().toLowerCase();
  if (directIcon && ICON_TO_AGENT_KEY[directIcon]) {
    return ICON_TO_AGENT_KEY[directIcon];
  }
  const def = getAgentDefinition(agentKey);
  if (def?.key) return def.key;
  return 'default';
};

/**
 * Verified Solar Bold-Duotone (24x24) icons matched cleanly per AI agent role.
 */
export const AiAgentIcon: React.FC<AiAgentIconProps> = ({
  agentKey,
  iconKey,
  size = 18,
  color,
  className = '',
}) => {
  const vectorKey = resolveVectorAgentKey(agentKey, iconKey);
  const style = color ? { color } : undefined;

  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className: `shrink-0 ${className}`.trim(),
    style,
    'aria-hidden': true as const,
  };

  switch (vectorKey) {
    case 'lead_orchestrator':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
            opacity="0.48"
          />
          <path
            fill="currentColor"
            d="M13.024 14.5601C13.5166 14.363 13.763 14.2645 13.9562 14.095C14.0055 14.0518 14.0518 14.0055 14.095 13.9562C14.2645 13.763 14.363 13.5166 14.5601 13.024C15.484 10.7142 15.946 9.5593 15.4977 8.89964C15.3914 8.74324 15.2565 8.60834 15.1001 8.50206C14.4405 8.0538 13.2856 8.51575 10.9758 9.43966C10.4831 9.63673 10.2368 9.73527 10.0435 9.90474C9.99429 9.94792 9.94792 9.99429 9.90474 10.0435C9.73527 10.2368 9.63673 10.4831 9.43966 10.9758C8.51575 13.2856 8.0538 14.4405 8.50206 15.1001C8.60834 15.2565 8.74324 15.3914 8.89964 15.4977C9.5593 15.946 10.7142 15.484 13.024 14.5601Z"
          />
        </svg>
      );

    case 'sales_leads':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M21 21.25C21.4142 21.25 21.75 21.5858 21.75 22C21.75 22.4142 21.4142 22.75 21 22.75H3C2.58579 22.75 2.25 22.4142 2.25 22C2.25 21.5858 2.58579 21.25 3 21.25H21Z"
          />
          <path
            fill="currentColor"
            d="M5 9C5.94281 9 6.41414 9.00008 6.70703 9.29297C6.99992 9.58586 7 10.0572 7 11V17C7 17.9428 6.99992 18.4141 6.70703 18.707C6.41414 18.9999 5.94281 19 5 19C4.05719 19 3.58586 18.9999 3.29297 18.707C3.00008 18.4141 3 17.9428 3 17V11C3 10.0572 3.00008 9.58586 3.29297 9.29297C3.58586 9.00008 4.05719 9 5 9Z"
          />
          <g fill="currentColor" opacity="0.5">
            <path d="M12 5C12.9428 5 13.4141 5.00008 13.707 5.29297C13.9999 5.58586 14 6.05719 14 7V17C14 17.9428 13.9999 18.4141 13.707 18.707C13.4141 18.9999 12.9428 19 12 19C11.0572 19 10.5859 18.9999 10.293 18.707C10.0001 18.4141 10 17.9428 10 17V7C10 6.05719 10.0001 5.58586 10.293 5.29297C10.5859 5.00008 11.0572 5 12 5Z" />
            <path d="M19 2C19.9428 2 20.4141 2.00008 20.707 2.29297C20.9999 2.58586 21 3.05719 21 4V17C21 17.9428 20.9999 18.4141 20.707 18.707C20.4141 18.9999 19.9428 19 19 19C18.0572 19 17.5859 18.9999 17.293 18.707C17.0001 18.4141 17 17.9428 17 17V4C17 3.05719 17.0001 2.58586 17.293 2.29297C17.5859 2.00008 18.0572 2 19 2Z" />
          </g>
        </svg>
      );

    case 'purchase_supply':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M12 2C12.9441 2.0001 13.8219 2.46071 15.5771 3.38184L17.5771 4.43164C19.6806 5.53549 20.7561 6.0997 21.3613 7.07227C21.3751 7.09433 21.3891 7.11715 21.4023 7.13965C21.9997 8.15413 22 9.41671 22 11.9414V12.0586C22 14.5834 21.9997 15.8458 21.4023 16.8604C20.805 17.8747 19.7294 18.4394 17.5781 19.5684L15.5781 20.6182C13.8225 21.5395 12.9443 22 12 22V12L2.6377 7.07227C3.24293 6.09963 4.31839 5.5355 6.42188 4.43164L8.42188 3.38184C10.1775 2.46053 11.0557 2 12 2Z"
            opacity="0.5"
          />
          <path
            fill="currentColor"
            d="M17.5774 4.43152L15.5774 3.38197C13.8218 2.46066 12.944 2 11.9997 2C11.0554 2 10.1776 2.46066 8.42197 3.38197L6.42197 4.43152C4.31821 5.53552 3.24291 6.09982 2.6377 7.07264L11.9997 12L21.3617 7.07264C20.7564 6.09982 19.6811 5.53552 17.5774 4.43152Z"
            opacity="0.5"
          />
          <path
            fill="currentColor"
            d="M17.0166 8.65332L21.041 6.6416C21.1786 6.79744 21.2985 6.96157 21.4033 7.13965C21.5529 7.39367 21.665 7.66382 21.749 7.96484L17.75 9.96387V13C17.75 13.4142 17.4142 13.75 17 13.75C16.5859 13.7498 16.25 13.4141 16.25 13V10.7139L12.75 12.4639V21.9043C12.4932 21.9682 12.2488 22 12 22C11.8814 22 11.7639 21.9921 11.6455 21.9775C11.5936 21.9712 11.5416 21.9633 11.4893 21.9541C11.4815 21.9527 11.4736 21.9516 11.4658 21.9502C11.4324 21.9441 11.399 21.9369 11.3652 21.9297C11.3272 21.9215 11.2886 21.9139 11.25 21.9043C10.5321 21.7255 9.71471 21.2966 8.42188 20.6182L6.42188 19.5684C4.27056 18.4394 3.19502 17.8747 2.59766 16.8604C2.00026 15.8458 2 14.5834 2 12.0586V11.9414C2 9.41671 2.00028 8.15413 2.59766 7.13965C2.70253 6.96159 2.82237 6.79743 2.95996 6.6416L12 11.1621L15.3867 9.46875L6.32324 4.4834C6.35604 4.46618 6.38954 4.44912 6.42285 4.43164L7.91602 3.64746L17.0166 8.65332Z"
          />
        </svg>
      );

    case 'customer_response':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M2 12.124C2 6.53269 6.47713 2 11.9999 2C17.5228 2 21.9999 6.53269 21.9999 12.124L21.9999 17.3675C22.0002 18.1844 22.0004 18.7446 21.8568 19.2364C21.576 20.1982 20.9046 20.9937 20.01 21.4245C19.5525 21.6449 19.0059 21.732 18.2088 21.8591L18.0789 21.8799C17.7954 21.9252 17.5532 21.9639 17.3522 21.9839C17.1431 22.0047 16.9299 22.0111 16.7118 21.9676C15.9942 21.8245 15.4024 21.3126 15.1508 20.6172C15.0744 20.4059 15.0474 20.1916 15.035 19.9793C15.0232 19.7753 15.0232 19.527 15.0232 19.2365L15.0231 15.0641C15.0226 14.6386 15.0222 14.2725 15.1195 13.959C15.3422 13.2416 15.9238 12.6975 16.6477 12.5292C16.9641 12.4556 17.3246 12.4849 17.7435 12.5189L17.8367 12.5264L17.9465 12.5352C18.7302 12.5975 19.2664 12.6402 19.7216 12.8106C20.0415 12.9304 20.3381 13.0953 20.6046 13.2976V12.124C20.6046 7.31288 16.7521 3.41266 11.9999 3.41266C7.24776 3.41266 3.39534 7.31288 3.39534 12.124V13.2976C3.66176 13.0953 3.95843 12.9304 4.27829 12.8106C4.73345 12.6402 5.26965 12.5975 6.05335 12.5352L6.16318 12.5264L6.25641 12.5189C6.67534 12.4849 7.03581 12.4556 7.35224 12.5292C8.07612 12.6975 8.65766 13.2416 8.88039 13.959C8.97774 14.2725 8.9773 14.6386 8.97678 15.0641L8.97671 19.2365C8.97671 19.527 8.97672 19.7753 8.96487 19.9793C8.95254 20.1916 8.9255 20.4059 8.84906 20.6172C8.59754 21.3126 8.00574 21.8245 7.28812 21.9676C7.07001 22.0111 6.85675 22.0047 6.64768 21.9839C6.44671 21.9639 6.20449 21.9252 5.92102 21.8799L5.79106 21.8591C4.99399 21.732 4.44737 21.6449 3.98991 21.4245C3.09534 20.9937 2.42388 20.1982 2.14308 19.2364C2.02467 18.8309 2.00404 18.3788 2.0006 17.7747L2 17.5803V12.124Z"
          />
          <g fill="currentColor" fillRule="evenodd" clipRule="evenodd" opacity="0.5">
            <path d="M12 5.75C12.4142 5.75 12.75 6.08579 12.75 6.5L12.75 11.5C12.75 11.9142 12.4142 12.25 12 12.25C11.5858 12.25 11.25 11.9142 11.25 11.5L11.25 6.5C11.25 6.08579 11.5858 5.75 12 5.75Z" />
            <path d="M15 7.25C15.4142 7.25 15.75 7.58579 15.75 8V10C15.75 10.4142 15.4142 10.75 15 10.75C14.5858 10.75 14.25 10.4142 14.25 10V8C14.25 7.58579 14.5858 7.25 15 7.25Z" />
            <path d="M9 7.25C9.41421 7.25 9.75 7.58579 9.75 8L9.75 10C9.75 10.4142 9.41421 10.75 9 10.75C8.58579 10.75 8.25 10.4142 8.25 10L8.25 8C8.25 7.58579 8.58579 7.25 9 7.25Z" />
          </g>
        </svg>
      );

    case 'hr_manager':
      return (
        <svg {...commonProps}>
          <g fill="currentColor" opacity="0.5">
            <path d="M16 14C18.7614 14 21 15.3431 21 17C21 18.6569 18.7614 20 16 20C13.2386 20 11 18.6569 11 17C11 15.3431 13.2386 14 16 14Z" />
            <path d="M15 3C16.6569 3 18 4.34315 18 6C18 7.65685 16.6569 9 15 9C13.3431 9 12 7.65685 12 6C12 4.34315 13.3431 3 15 3Z" />
          </g>
          <path fill="currentColor" d="M9 13.001C12.866 13.001 16 14.7918 16 17.001C16 19.2101 12.866 21.001 9 21.001C5.13401 21.001 2 19.2101 2 17.001C2 14.7918 5.13401 13.001 9 13.001Z" />
          <path fill="currentColor" d="M9 2C11.2091 2 13 3.79086 13 6C13 8.20914 11.2091 10 9 10C6.79086 10 5 8.20914 5 6C5 3.79086 6.79086 2 9 2Z" />
        </svg>
      );

    case 'reservation':
      return (
        <svg {...commonProps}>
          <path fill="currentColor" d="M16.5 15C17.3284 15 18 15.6716 18 16.5C18 17.3284 17.3284 18 16.5 18C15.6716 18 15 17.3284 15 16.5C15 15.6716 15.6716 15 16.5 15Z" />
          <path
            fill="currentColor"
            d="M17.04 2C17.4575 2.00005 17.7959 2.31006 17.7959 2.69238V4.15039C19.2467 4.25678 20.1997 4.5174 20.8994 5.1582C21.599 5.79899 21.8838 6.67149 22 8V9H2V8C2.11617 6.67149 2.40096 5.79899 3.10059 5.1582C3.80033 4.5174 4.75327 4.25678 6.2041 4.15039V2.69238C6.2041 2.31006 6.54248 2.00005 6.95996 2C7.37748 2 7.71582 2.31003 7.71582 2.69238V4.08887C8.3864 4.07696 9.13864 4.07715 9.98438 4.07715H14.0156C14.8614 4.07715 15.6136 4.07696 16.2842 4.08887V2.69238C16.2842 2.31003 16.6225 2 17.04 2Z"
          />
          <path
            fill="currentColor"
            d="M22 14V12C22 11.161 21.9873 9.66527 21.9744 9H2.00586C1.99296 9.66527 2.00564 11.161 2.00564 12V14C2.00564 17.7712 2.00564 19.6569 3.17688 20.8284C4.34813 22 6.23321 22 10.0034 22H14.0023C17.7724 22 19.6575 22 20.8288 20.8284C22 19.6569 22 17.7712 22 14Z"
            opacity="0.5"
          />
        </svg>
      );

    case 'project_process':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M19.0215 10.3145C21.0073 11.1088 22 11.5065 22 12C22 12.4935 21.0073 12.8912 19.0215 13.6855L18.2334 14L19.0215 14.3145C21.0073 15.1088 22 15.5065 22 16C22 16.4935 21.0073 16.8912 19.0215 17.6855L16.2129 18.8086C14.227 19.6029 13.2339 20 12 20C10.7661 20 9.773 19.6029 7.78711 18.8086L4.97852 17.6855C2.9927 16.8912 2 16.4935 2 16C2 15.5065 2.9927 15.1088 4.97852 14.3145L5.76562 14L4.97852 13.6855C2.9927 12.8912 2 12.4935 2 12C2 11.5065 2.9927 11.1088 4.97852 10.3145L5.7666 10L7.78711 10.8086C9.773 11.6029 10.7661 12 12 12C13.2339 12 14.227 11.6029 16.2129 10.8086L18.2334 10L19.0215 10.3145Z"
            opacity="0.5"
          />
          <path
            fill="currentColor"
            d="M19.0215 10.3145C21.0073 11.1088 22 11.5065 22 12C22 12.4935 21.0073 12.8912 19.0215 13.6855L16.2129 14.8086C14.227 15.6029 13.2339 16 12 16C10.7661 16 9.773 15.6029 7.78711 14.8086L4.97852 13.6855C2.9927 12.8912 2 12.4935 2 12C2 11.5065 2.9927 11.1088 4.97852 10.3145L5.7666 10L7.78711 10.8086C9.773 11.6029 10.7661 12 12 12C13.2339 12 14.227 11.6029 16.2129 10.8086L18.2334 10L19.0215 10.3145Z"
            opacity="0.5"
          />
          <path
            fill="currentColor"
            d="M12 4C13.2339 4 14.227 4.39705 16.2129 5.19141L19.0215 6.31445C21.0073 7.10878 22 7.50646 22 8C22 8.49354 21.0073 8.89122 19.0215 9.68555L16.2129 10.8086C14.227 11.6029 13.2339 12 12 12C10.7661 12 9.773 11.6029 7.78711 10.8086L4.97852 9.68555C2.9927 8.89122 2 8.49354 2 8C2 7.50646 2.9927 7.10878 4.97852 6.31445L7.78711 5.19141C9.773 4.39705 10.7661 4 12 4Z"
          />
        </svg>
      );

    case 'instagrammer':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M9.77778 21H14.2222C17.3433 21 18.9038 21 20.0248 20.2646C20.51 19.9462 20.9267 19.5371 21.251 19.0607C22 17.9601 22 16.4279 22 13.3636C22 10.2994 22 8.76721 21.251 7.6666C20.9267 7.19014 20.51 6.78104 20.0248 6.46268C19.3044 5.99013 18.4027 5.82123 17.022 5.76086C16.3631 5.76086 15.7959 5.27068 15.6667 4.63636C15.4728 3.68489 14.6219 3 13.6337 3H10.3663C9.37805 3 8.52715 3.68489 8.33333 4.63636C8.20412 5.27068 7.63685 5.76086 6.978 5.76086C5.59733 5.82123 4.69555 5.99013 3.97524 6.46268C3.48995 6.78104 3.07328 7.19014 2.74902 7.6666C2 8.76721 2 10.2994 2 13.3636C2 16.4279 2 17.9601 2.74902 19.0607C3.07328 19.5371 3.48995 19.9462 3.97524 20.2646C5.09624 21 6.65675 21 9.77778 21Z"
            opacity="0.5"
          />
          <path
            fill="currentColor"
            d="M17.5562 9.27246C17.096 9.27246 16.7229 9.63877 16.7229 10.0906C16.7229 10.5425 17.096 10.9088 17.5562 10.9088H18.6673C19.1276 10.9088 19.5007 10.5425 19.5007 10.0906C19.5007 9.63877 19.1276 9.27246 18.6673 9.27246H17.5562Z"
          />
          <path
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12.0007 9.27246C9.69946 9.27246 7.83398 11.104 7.83398 13.3634C7.83398 15.6227 9.69946 17.4543 12.0007 17.4543C14.3018 17.4543 16.1673 15.6227 16.1673 13.3634C16.1673 11.104 14.3018 9.27246 12.0007 9.27246ZM12.0007 10.9088C10.6199 10.9088 9.50065 12.0078 9.50065 13.3634C9.50065 14.719 10.6199 15.8179 12.0007 15.8179C13.3814 15.8179 14.5007 14.719 14.5007 13.3634C14.5007 12.0078 13.3814 10.9088 12.0007 10.9088Z"
          />
        </svg>
      );

    case 'system_guide':
      return (
        <svg {...commonProps}>
          <path
            fill="currentColor"
            d="M8 18H7.42578C6.34231 18 5.96314 18.0059 5.67285 18.0684C5.15962 18.1788 4.71302 18.4149 4.3877 18.7344C4.27803 18.8421 4.22312 18.8962 4.09668 19.2393C4.0241 19.4362 4.00002 19.5686 4 19.7002V7.8418C4 6.24463 4.0022 5.13053 4.11426 4.29004C4.22312 3.47366 4.42217 3.04134 4.72754 2.7334C5.03292 2.42551 5.46192 2.225 6.27148 2.11523C7.10491 2.00228 8.20938 2 9.79297 2H14.207C15.7906 2 16.8951 2.00228 17.7285 2.11523C18.5381 2.225 18.9671 2.42551 19.2725 2.7334C19.5778 3.04134 19.7769 3.47366 19.8857 4.29004C19.9978 5.13053 20 6.24463 20 7.8418V18H12V20.0283C12 20.3053 12 20.444 11.9053 20.5C11.8104 20.556 11.6804 20.4941 11.4209 20.3701L10.1787 19.7764C10.0911 19.7345 10.0472 19.7139 10 19.7139C9.95283 19.7139 9.9089 19.7345 9.82129 19.7764L8.5791 20.3701C8.31965 20.4941 8.18958 20.556 8.09473 20.5C7.99997 20.444 8 20.3053 8 20.0283V18Z"
            opacity="0.5"
          />
          <path
            fill="currentColor"
            d="M8.00027 18V20.0283C8.00027 20.3053 8.00024 20.444 8.09499 20.5C8.18985 20.556 8.31992 20.4941 8.57937 20.3701L9.82156 19.7764C9.90917 19.7345 9.9531 19.7139 10.0003 19.7139C10.0474 19.7139 10.0914 19.7345 10.179 19.7764L11.4212 20.3701C11.6806 20.4941 11.8107 20.556 11.9055 20.5C12.0003 20.444 12.0003 20.3053 12.0003 20.0283V18H20.0003C19.9967 18.9296 19.9788 19.6231 19.887 20.1709C19.7777 20.8229 19.5773 21.1681 19.2708 21.4141C18.9642 21.66 18.5336 21.8205 17.721 21.9082C16.8843 21.9984 15.7755 22 14.1858 22H9.75515C8.16514 22 7.05572 21.9985 6.21902 21.9082C5.40635 21.8205 4.97576 21.6601 4.66921 21.4141C4.36282 21.1681 4.16325 20.8228 4.05398 20.1709C4.04579 20.122 4.0376 20.0717 4.03054 20.0205C3.99045 19.7292 3.9704 19.5826 4.09695 19.2393C4.22339 18.8962 4.2783 18.8421 4.38796 18.7344C4.71328 18.4149 5.15989 18.1788 5.67312 18.0684C5.96341 18.0059 6.34258 18 7.42605 18H8.00027Z"
          />
          <path fill="currentColor" d="M13.0003 9.75C13.4145 9.75 13.7503 10.0858 13.7503 10.5C13.7503 10.9142 13.4145 11.25 13.0003 11.25H8.00027C7.58605 11.25 7.25027 10.9142 7.25027 10.5C7.25027 10.0858 7.58605 9.75 8.00027 9.75H13.0003Z" />
          <path fill="currentColor" d="M16.0003 6.25C16.4145 6.25 16.7503 6.58579 16.7503 7C16.7503 7.41421 16.4145 7.75 16.0003 7.75H8.00027C7.58605 7.75 7.25027 7.41421 7.25027 7C7.25027 6.58579 7.58605 6.25 8.00027 6.25H16.0003Z" />
        </svg>
      );

    default:
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" fill="currentColor" opacity="0.45" />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      );
  }
};

export type AiAgentAvatarProps = {
  agentKey?: AgentKey | string | null;
  color?: string | null;
  size?: number;
  isWorking?: boolean;
  disabled?: boolean;
  className?: string;
};

export const AiAgentAvatar: React.FC<AiAgentAvatarProps> = ({
  agentKey,
  color,
  size = 32,
  isWorking = false,
  disabled = false,
  className = '',
}) => {
  const def = getAgentDefinition(agentKey);
  const accent = disabled ? '#94a3b8' : (color || def?.badgeColor || '#6366f1');
  const iconSize = Math.max(13, Math.round(size * 0.56));

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl transition-transform ${className}`.trim()}
      style={{
        width: size,
        height: size,
        background: disabled
          ? 'rgba(148, 163, 184, 0.14)'
          : `linear-gradient(145deg, ${accent}24, ${accent}0e)`,
        border: `1px solid ${disabled ? 'rgba(148, 163, 184, 0.3)' : `${accent}40`}`,
        color: accent,
      }}
    >
      {isWorking && !disabled ? (
        <span
          className="kalam-agent-working-halo pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px]"
          style={{ borderColor: `${accent}88` }}
        />
      ) : null}
      <AiAgentIcon agentKey={agentKey} iconKey={def?.iconKey} size={iconSize} color={accent} />
    </span>
  );
};

export type CameoProfile = {
  headType: 'squircle' | 'circle' | 'oval' | 'rounded-square' | 'faceted-squircle';
  hairType:
    | 'side-part-commander'
    | 'curls-forward'
    | 'clean-crop'
    | 'soft-bob'
    | 'top-knot'
    | 'slick-back'
    | 'architect-part'
    | 'stylish-waves'
    | 'neat-crop';
  mouthType: 'calm-beam' | 'warm-smile' | 'firm-line' | 'precise-line' | 'open-beam';
  accessory: 'none' | 'glasses' | 'earpiece' | 'commander-star';
};

export const CAMEO_AGENT_PROFILES: Record<string, CameoProfile> = {
  lead_orchestrator: {
    headType: 'squircle',
    hairType: 'side-part-commander',
    mouthType: 'calm-beam',
    accessory: 'commander-star',
  },
  sales_leads: {
    headType: 'oval',
    hairType: 'curls-forward',
    mouthType: 'warm-smile',
    accessory: 'none',
  },
  purchase_supply: {
    headType: 'rounded-square',
    hairType: 'clean-crop',
    mouthType: 'firm-line',
    accessory: 'glasses',
  },
  customer_response: {
    headType: 'circle',
    hairType: 'soft-bob',
    mouthType: 'warm-smile',
    accessory: 'earpiece',
  },
  hr_manager: {
    headType: 'oval',
    hairType: 'top-knot',
    mouthType: 'warm-smile',
    accessory: 'none',
  },
  reservation: {
    headType: 'squircle',
    hairType: 'slick-back',
    mouthType: 'precise-line',
    accessory: 'none',
  },
  project_process: {
    headType: 'faceted-squircle',
    hairType: 'architect-part',
    mouthType: 'calm-beam',
    accessory: 'none',
  },
  instagrammer: {
    headType: 'circle',
    hairType: 'stylish-waves',
    mouthType: 'open-beam',
    accessory: 'none',
  },
  system_guide: {
    headType: 'squircle',
    hairType: 'neat-crop',
    mouthType: 'warm-smile',
    accessory: 'glasses',
  },
};

export const getCameoProfile = (agentKey?: string | null): CameoProfile => {
  const key = String(agentKey || '').trim().toLowerCase();
  return (
    CAMEO_AGENT_PROFILES[key] || {
      headType: 'squircle',
      hairType: 'clean-crop',
      mouthType: 'calm-beam',
      accessory: 'none',
    }
  );
};

export type AiAgentCameoFigureProps = {
  agentKey?: AgentKey | string | null;
  color?: string | null;
  size?: number;
  activeVisual?: boolean;
  isWorking?: boolean;
  className?: string;
};

/**
 * Authentic DiceBear Cameo Avatar Vector Representation for KalamApp AI Agents.
 */
export const AiAgentCameoFigure: React.FC<AiAgentCameoFigureProps> = ({
  agentKey,
  color,
  size = 56,
  activeVisual = true,
  isWorking = false,
  className = '',
}) => {
  const rawUid = useId().replace(/:/g, '');
  const def = getAgentDefinition(agentKey);
  const profile = getCameoProfile(agentKey);
  const accent = activeVisual ? (color || def?.badgeColor || '#6366f1') : '#94a3b8';
  const overlayColor = '#ffffff';
  const overlayOpacity = '0.45';

  let headPath = '';
  if (profile.headType === 'squircle') {
    headPath = 'M18 40 q0-24 24-24 h16 q24 0 24 24 v18 q0 24-24 24 H42 q-24 0-24-24 Z';
  } else if (profile.headType === 'circle') {
    headPath = 'M50 16 A34 34 0 1 1 49.9 16 Z';
  } else if (profile.headType === 'oval') {
    headPath = 'M50 14 A30 36 0 1 1 49.9 14 Z';
  } else if (profile.headType === 'rounded-square') {
    headPath = 'M22 20 h56 a12 12 0 0 1 12 12 v40 a12 12 0 0 1 -12 12 h-56 a12 12 0 0 1 -12 -12 v-40 a12 12 0 0 1 12 -12 Z';
  } else {
    headPath = 'M20 40 q0-23 23-23 h14 q23 0 23 23 v16 q0 23-23 23 H43 q-23 0-23-23 Z';
  }

  let hairMarkup = null;
  if (profile.hairType === 'side-part-commander') {
    hairMarkup = (
      <path
        d="M10 10 h80 v32 c-8 -6 -24 -6 -40 2 c-14 7 -26 6 -40 0 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else if (profile.hairType === 'curls-forward') {
    hairMarkup = (
      <path
        d="M10 10 h80 v34 a8 8 0 0 1 -16 0 a8 8 0 0 1 -16 0 a8 8 0 0 1 -16 0 a8 8 0 0 1 -16 0 a8 8 0 0 1 -16 0 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else if (profile.hairType === 'clean-crop') {
    hairMarkup = (
      <path
        d="M12 12 h76 v26 c-12 0 -24 -2 -38 4 c-14 6 -26 4 -38 -2 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else if (profile.hairType === 'soft-bob') {
    hairMarkup = (
      <path
        d="M12 10 h76 v46 c-6 0 -12 -14 -12 -28 c-16 0 -36 0 -52 14 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else if (profile.hairType === 'top-knot') {
    hairMarkup = (
      <g>
        <circle cx="50" cy="11" r="9" fill={accent} />
        <circle cx="50" cy="11" r="9" fill={overlayColor} fillOpacity={overlayOpacity} />
        <path
          d="M14 14 h72 v30 c-14 -4 -30 -4 -44 2 c-12 5 -20 4 -28 0 Z"
          fill={overlayColor}
          fillOpacity={overlayOpacity}
        />
      </g>
    );
  } else if (profile.hairType === 'slick-back') {
    hairMarkup = (
      <path
        d="M12 10 h76 v24 c-20 -4 -48 -4 -76 6 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else if (profile.hairType === 'architect-part') {
    hairMarkup = (
      <path
        d="M10 10 h80 v32 l-36 -12 l-44 14 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else if (profile.hairType === 'stylish-waves') {
    hairMarkup = (
      <path
        d="M10 10 h80 v48 c-10 -4 -16 -18 -18 -32 c-14 4 -28 4 -44 -4 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  } else {
    hairMarkup = (
      <path
        d="M12 12 h76 v28 c-14 -2 -28 -2 -42 4 c-14 6 -24 4 -34 -2 Z"
        fill={overlayColor}
        fillOpacity={overlayOpacity}
      />
    );
  }

  let mouthMarkup = null;
  if (profile.mouthType === 'calm-beam') {
    mouthMarkup = (
      <path
        d="M38 66 q12 5 24 0"
        stroke={overlayColor}
        strokeOpacity="0.9"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
    );
  } else if (profile.mouthType === 'warm-smile') {
    mouthMarkup = (
      <path
        d="M37 65 q13 7 26 0"
        stroke={overlayColor}
        strokeOpacity="0.95"
        strokeWidth="4.8"
        strokeLinecap="round"
        fill="none"
      />
    );
  } else if (profile.mouthType === 'firm-line') {
    mouthMarkup = (
      <line
        x1="39"
        y1="66"
        x2="61"
        y2="66"
        stroke={overlayColor}
        strokeOpacity="0.9"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    );
  } else if (profile.mouthType === 'precise-line') {
    mouthMarkup = (
      <line
        x1="40"
        y1="67"
        x2="60"
        y2="67"
        stroke={overlayColor}
        strokeOpacity="0.9"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
    );
  } else {
    mouthMarkup = (
      <path
        d="M36 64 q14 8 28 0"
        stroke={overlayColor}
        strokeOpacity="0.95"
        strokeWidth="4.8"
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  let accessoryMarkup = null;
  if (profile.accessory === 'glasses') {
    accessoryMarkup = (
      <g>
        <rect
          x="25"
          y="45"
          width="20"
          height="13"
          rx="5"
          fill="none"
          stroke={overlayColor}
          strokeOpacity="0.85"
          strokeWidth="3.5"
        />
        <rect
          x="55"
          y="45"
          width="20"
          height="13"
          rx="5"
          fill="none"
          stroke={overlayColor}
          strokeOpacity="0.85"
          strokeWidth="3.5"
        />
        <line
          x1="45"
          y1="51"
          x2="55"
          y2="51"
          stroke={overlayColor}
          strokeOpacity="0.85"
          strokeWidth="3"
        />
      </g>
    );
  } else if (profile.accessory === 'earpiece') {
    accessoryMarkup = (
      <g>
        <circle cx="81" cy="53" r="5" fill={overlayColor} fillOpacity="0.9" />
        <path
          d="M81 56 q-4 8 -12 11"
          stroke={overlayColor}
          strokeOpacity="0.9"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    );
  } else if (profile.accessory === 'commander-star') {
    accessoryMarkup = (
      <polygon
        points="50,22 52.5,27.5 58,28.5 54,32.5 55,38 50,35 45,38 46,32.5 42,28.5 47.5,27.5"
        fill={overlayColor}
        fillOpacity={0.92}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`.trim()}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`cameo-clip-${rawUid}`}>
          <path d={headPath} />
        </clipPath>
      </defs>

      {/* Head Silhouette in Role Accent Color */}
      <path d={headPath} fill={accent} />

      {/* Clipped Cameo Features: Hair, Accessory & Mouth */}
      <g clipPath={`url(#cameo-clip-${rawUid})`}>
        {hairMarkup}
        {accessoryMarkup}
        {mouthMarkup}
      </g>

      {/* Subtle crisp highlight rim for dark mode elegance */}
      <path d={headPath} stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.5" fill="none" />
    </svg>
  );
};

export type AiAgentDeskSeatFigureProps = {
  agentKey: AgentKey;
  color: string;
  isWorking?: boolean;
  isSelected?: boolean;
  canUse?: boolean;
  orgEnabled?: boolean;
  hasPending?: boolean;
  seatIndex?: number;
};

/**
 * Seated Cameo Figure at the Shared Studio Desk.
 * Replaces the old silhouette with the dignified, official DiceBear Cameo portrait!
 */
export const AiAgentDeskSeatFigure: React.FC<AiAgentDeskSeatFigureProps> = ({
  agentKey,
  color,
  isWorking = false,
  isSelected = false,
  canUse = true,
  orgEnabled = true,
  hasPending = false,
  seatIndex = 0,
}) => {
  const isLead = agentKey === 'lead_orchestrator';
  const activeVisual = canUse && orgEnabled;
  const accent = activeVisual ? color : '#94a3b8';
  const delayStyle = { animationDelay: `${(seatIndex % 9) * 0.22}s` };

  return (
    <div
      className={`relative flex w-full flex-col items-center justify-end select-none transition-all duration-200 ${
        isLead ? 'h-[74px]' : 'h-[64px]'
      } ${!activeVisual ? 'opacity-55 grayscale-[35%]' : ''}`}
    >
      {/* Illuminated Aura Floor Glow when working, selected or lead */}
      {((isWorking || isSelected || isLead) && activeVisual) ? (
        <div
          className={`pointer-events-none absolute bottom-1 rounded-full blur-md transition-opacity ${
            isLead ? 'h-14 w-16' : 'h-12 w-14'
          } ${isWorking ? 'kalam-desk-screen-glow' : isSelected ? 'opacity-40' : 'opacity-20'}`}
          style={{ backgroundColor: `${accent}35`, ...delayStyle }}
        />
      ) : null}

      {/* Cameo Avatar Disc */}
      <div
        className={`relative z-10 transition-transform duration-200 ${
          !activeVisual
            ? ''
            : isWorking
              ? 'kalam-desk-agent-working'
              : 'kalam-desk-agent-idle'
        }`}
        style={delayStyle}
      >
        <AiAgentCameoFigure
          agentKey={agentKey}
          color={accent}
          size={isLead ? 58 : 50}
          activeVisual={activeVisual}
          isWorking={isWorking}
        />

        {/* Minimalist Desk Workstation Base Bar */}
        <div className="mx-auto -mt-1 h-1.5 w-9 rounded-full bg-slate-300 dark:bg-slate-700/80" />
      </div>

      {/* Floating minimal status spark if waiting approval */}
      {hasPending && activeVisual ? (
        <div className="kalam-desk-pending-bob pointer-events-none absolute -top-1 right-2 z-20">
          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 shadow-sm ring-2 ring-white dark:ring-slate-900">
            <span className="h-1 w-1 rounded-full bg-white" />
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default AiAgentIcon;
