import React from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  BookOpen,
  Users,
  Settings,
  FileText,
  Home,
  Eye,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';
import { Link, useLocation } from 'react-router-dom';

interface SidebarItem {
  id: string; // Used as the path now
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const sidebarItems: SidebarItem[] = [
  { id: '/', label: 'Inicio', icon: <Home className="w-5 h-5" /> },
  { id: '/schedule', label: 'Horarios', icon: <Calendar className="w-5 h-5" /> },
  { id: '/visualization', label: 'Visualización', icon: <Eye className="w-5 h-5" /> },
  { id: '/subjects', label: 'Materias', icon: <BookOpen className="w-5 h-5" /> },
  { id: '/professors', label: 'Profesores', icon: <Users className="w-5 h-5" /> },
  { id: '/reports', label: 'Reportes', icon: <FileText className="w-5 h-5" /> },
  { id: '/sync', label: 'Sincronización', icon: <RefreshCw className="w-5 h-5" /> },
  { id: '/settings', label: 'Configuración', icon: <Settings className="w-5 h-5" /> },
];

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <motion.aside
      initial={false}
      animate={{ 
        width: collapsed ? '80px' : '260px',
        x: 0
      }}
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-gradient-to-b from-brand-navy to-brand-blue', // Updated gradient
        'border-r border-brand-light/20 shadow-2xl transition-all duration-300',
        'flex flex-col',
        'hidden md:flex' 
      )}
    >
      {/* Logo/Brand */}
      <div className="flex h-16 items-center justify-center border-b border-brand-light/20 px-4">
        {collapsed ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent text-white font-bold text-lg">
            USM
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent text-white font-bold">
              USM
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">Farmabox</span>
              <span className="text-xs text-brand-light">USM Farmacia</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {sidebarItems.map((item, index) => {
          const isActive = currentPath === item.id;
          const content = (
            <Link
              key={item.id}
              to={item.id}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                'text-sm font-medium',
                isActive
                  ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/50'
                  : 'text-brand-light hover:bg-brand-blue/50 hover:text-white',
                collapsed && 'justify-center px-2'
              )}
            >
              <span className={cn('flex-shrink-0', isActive && 'text-white')}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );

          if (collapsed && !isActive) {
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                  <Tooltip content={item.label} side="right">
                    {content}
                  </Tooltip>
              </motion.div>
            );
          }

          return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                  {content}
              </motion.div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-brand-light/20 p-4">
        {onToggleCollapse && (
          <Tooltip content={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleCollapse}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
                'text-sm text-brand-light hover:bg-brand-blue/50 hover:text-white',
                collapsed && 'justify-center'
              )}
            >
              <motion.div
                animate={{ rotate: collapsed ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </motion.div>
              {!collapsed && <span>Colapsar</span>}
            </motion.button>
          </Tooltip>
        )}
      </div>
    </motion.aside>
  );
}
