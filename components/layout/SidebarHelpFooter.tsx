import React from 'react';
import ContextualTutorialButton from '../cms/ContextualTutorialButton';
import TazeSystemAttribution from '../common/TazeSystemAttribution';
import SidebarSupportButton from './SidebarSupportButton';
import type { TutorialViewer } from '../../hooks/useContextualTutorials';

type Props = {
  contexts: string[];
  viewer: TutorialViewer;
  ticketPath?: string;
  unread?: number;
  onNavigate: (path: string) => void;
};

const SidebarHelpFooter: React.FC<Props> = ({ contexts, viewer, ticketPath, unread, onNavigate }) => (
  <div className="sidebar-help-footer" dir="rtl">
    <div className="sidebar-help-actions">
      <div className="sidebar-help-tutorials">
        <ContextualTutorialButton contexts={contexts} viewer={viewer} buttonLabel="آموزش‌ها" buttonClassName="sidebar-tutorial-button" />
      </div>
      <SidebarSupportButton ticketPath={ticketPath} unread={unread} onNavigate={onNavigate} />
    </div>
    <TazeSystemAttribution collapsed={false} />
  </div>
);
export default SidebarHelpFooter;
