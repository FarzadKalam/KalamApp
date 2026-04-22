import React from "react";

interface ViewWrapperProps {
  isFullscreen: boolean;
  children: React.ReactNode;
}

const ViewWrapper: React.FC<ViewWrapperProps> = ({ isFullscreen, children }) => {
  return (
    <div className={`
      bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-[2rem] p-1.5 md:p-2 shadow-sm min-h-0 flex flex-col overflow-hidden
      ${isFullscreen ? "fixed inset-2 z-50 h-[calc(var(--app-viewport-height,100dvh)-1rem)]" : "relative flex-1 h-full"}
    `}>
      {children}
    </div>
  );
};

export default ViewWrapper;
