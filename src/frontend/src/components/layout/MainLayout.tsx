import React, { useState } from 'react';

import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
  showHeader?: boolean;
}

export function MainLayout({
  children,
  showSidebar = true,
  showHeader = true,
}: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-brand-pale/20">
      {showSidebar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      <div
        className={cn(
          'transition-all duration-300 pb-16 md:pb-0', // Add padding bottom for mobile nav
          showSidebar && (sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'),
          'ml-0'
        )}
      >
        {showHeader && <Header />}

        <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6">
            {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      {showSidebar && (
        <BottomNav />
      )}
    </div>
  );
}
