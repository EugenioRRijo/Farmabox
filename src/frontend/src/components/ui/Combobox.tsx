import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** Texto de la opción que limpia la selección (value === 'all'). */
  allLabel?: string;
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * Selector buscable (combobox): se puede escribir para filtrar las opciones y
 * navegar con el teclado. Pensado para listas largas como profesores, donde un
 * <select> nativo obliga a desplazarse sin poder buscar.
 */
export function Combobox({
  value,
  onChange,
  options,
  allLabel = 'Todos',
  placeholder = 'Buscar…',
  icon,
  className,
  ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allOptions = useMemo<ComboboxOption[]>(
    () => [{ value: 'all', label: allLabel }, ...options],
    [options, allLabel]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(o => o.label.toLowerCase().includes(q));
  }, [allOptions, query]);

  const selectedLabel = allOptions.find(o => o.value === value)?.label ?? '';

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Mantener la opción resaltada visible.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const openMenu = () => {
    setOpen(true);
    setQuery('');
    const idx = filtered.findIndex(o => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const select = (val: string) => {
    onChange(val);
    close();
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex items-center h-9 rounded-lg border bg-white px-2.5 transition-colors',
          open ? 'border-brand-accent ring-2 ring-brand-accent/30' : 'border-gray-300 hover:border-gray-400'
        )}
      >
        <span className="text-gray-400 shrink-0">{icon ?? <Search className="w-4 h-4" />}</span>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          onChange={e => {
            setQuery(e.target.value);
            setHighlight(0);
            if (!open) setOpen(true);
          }}
          onFocus={openMenu}
          onClick={openMenu}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 bg-transparent px-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        <ChevronDown className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 select-none">Sin coincidencias</li>
            ) : (
              filtered.map((o, i) => {
                const isSelected = o.value === value;
                const isHighlighted = i === highlight;
                return (
                  <li
                    key={o.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={e => {
                      e.preventDefault();
                      select(o.value);
                    }}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer',
                      isHighlighted ? 'bg-brand-pale text-brand-navy' : 'text-gray-700',
                      o.value === 'all' && 'text-gray-500 italic'
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand-accent shrink-0" />}
                  </li>
                );
              })
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
