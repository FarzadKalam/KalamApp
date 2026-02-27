import React from "react";

interface ViewWrapperProps {
  isFullscreen: boolean;
  children: React.ReactNode;
}

const ViewWrapper: React.FC<ViewWrapperProps> = ({ isFullscreen, children }) => {
  return (
    <div className={`
      bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-[2rem] p-2 md:p-3 shadow-sm h-full min-h-0 flex flex-col
      ${isFullscreen ? "fixed inset-2 z-50 overflow-auto" : "relative"}
    `}>
      {children}
    </div>
  );
};

export default ViewWrapper;
