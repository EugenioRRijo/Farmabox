import React from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { MESSAGES } from '@/constants';
import { SyncButton } from './SyncButton';
import { SyncStatusBadge } from './SyncStatusBadge';

interface HeaderProps {
  onSearch?: (query: string) => void;
}

export function Header({ onSearch }: HeaderProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-30 w-full border-b border-brand-light/20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-sm"
    >
      <div className="flex h-16 items-center gap-4 px-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-brand-navy">{MESSAGES.APP_TITLE}</h1>
          <p className="text-xs text-brand-light hidden sm:block">{MESSAGES.APP_SUBTITLE}</p>
        </div>

        {/* Buscador (opcional; se muestra solo si se pasa onSearch) */}
        {onSearch && (
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-accent/50" />
              <Input
                type="search"
                placeholder="Buscar materias, profesores, aulas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-brand-light/30 focus:border-brand-accent"
              />
            </div>
          </form>
        )}

        <SyncStatusBadge />
        <SyncButton />
      </div>
    </motion.header>
  );
}
