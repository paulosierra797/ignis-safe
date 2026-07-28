import React, { createContext, useContext, useEffect, useState } from 'react';

const LayoutContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
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

    return () => {
      document.body.classList.remove('sidebar-collapsed');
    };
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return undefined;
    }

    const body = document.body;
    const scrollY = window.scrollY || window.pageYOffset;

    // Lock the page in place behind the drawer, preserving the scroll
    // position so it can be restored when the drawer closes.
    body.classList.add('sidebar-mobile-open');
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    const isInsideOpenSidebar = (target) => {
      const sidebarEl = document.querySelector('.sidebar--mobile-open');
      return Boolean(sidebarEl && target instanceof Node && sidebarEl.contains(target));
    };

    // Belt-and-suspenders: block wheel/touch scrolling that reaches
    // anything outside the open sidebar (e.g. inner scroll containers
    // on the page behind it), independent of CSS overflow rules.
    const blockBackgroundScroll = (event) => {
      if (isInsideOpenSidebar(event.target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener('wheel', blockBackgroundScroll, { passive: false });
    document.addEventListener('touchmove', blockBackgroundScroll, { passive: false });

    return () => {
      document.removeEventListener('wheel', blockBackgroundScroll);
      document.removeEventListener('touchmove', blockBackgroundScroll);

      body.classList.remove('sidebar-mobile-open');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';

      window.scrollTo(0, scrollY);
    };
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
