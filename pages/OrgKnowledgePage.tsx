import React from 'react';
import AiKnowledgeTab from './Settings/AiKnowledgeTab';

const OrgKnowledgePage: React.FC = () => (
  <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fadeIn">
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.25rem] shadow-sm border border-gray-200 dark:border-gray-800 p-5 md:p-6 min-h-[70vh] transition-colors">
      <AiKnowledgeTab />
    </div>
  </div>
);

export default OrgKnowledgePage;
