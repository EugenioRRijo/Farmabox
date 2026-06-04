import { 
  Calendar, 
  BookOpen, 
  Users, 
  Home,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';

export function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  const items = [
    { id: '/', label: 'Inicio', icon: <Home className="w-5 h-5" /> },
    { id: '/schedule', label: 'Horarios', icon: <Calendar className="w-5 h-5" /> },
    { id: '/subjects', label: 'Materias', icon: <BookOpen className="w-5 h-5" /> },
    { id: '/professors', label: 'Profesores', icon: <Users className="w-5 h-5" /> },
    { id: '/reports', label: 'Reportes', icon: <FileText className="w-5 h-5" /> },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {items.map((item) => {
        const isActive = currentPath === item.id;
        return (
          <Link
            key={item.id}
            to={item.id}
            className={cn(
              "flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-colors",
              isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
            )}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
