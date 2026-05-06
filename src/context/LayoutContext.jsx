import React, { createContext, useContext, useEffect, useState } from 'react';

const LayoutContext = createContext();

export const useLayout = () => {
  const context = useContext(LayoutContext);

  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }

  return context;
};

export const LayoutProvider = ({ children }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const storedValue = localStorage.getItem('sidebar-collapsed');
    return storedValue === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', isSidebarCollapsed);
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));

    // prevent body scroll when mobile sidebar is open
    document.body.classList.toggle('sidebar-mobile-open', isMobileSidebarOpen);

    return () => {
      document.body.classList.remove('sidebar-collapsed');
    };
  }, [isSidebarCollapsed]);

  useEffect(() => {
    // ensure body class sync when mobile sidebar changes
    document.body.classList.toggle('sidebar-mobile-open', isMobileSidebarOpen);
  }, [isMobileSidebarOpen]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((currentValue) => !currentValue);
  };

  const openMobileSidebar = () => setIsMobileSidebarOpen(true);
  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);
  const toggleMobileSidebar = () => setIsMobileSidebarOpen((v) => !v);

  const value = {
    isSidebarCollapsed,
    toggleSidebar,
    setIsSidebarCollapsed,
    isMobileSidebarOpen,
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
  };

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
};