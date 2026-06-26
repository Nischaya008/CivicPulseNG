import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  success: 'bg-[#FFF8EC] border-l-[#546B41] border-y-[#DCCCAC]/50 border-r-[#DCCCAC]/50 text-[#546B41]',
  error: 'bg-[#FFF8EC] border-l-red-500 border-y-[#DCCCAC]/50 border-r-[#DCCCAC]/50 text-red-700',
  warning: 'bg-[#FFF8EC] border-l-amber-500 border-y-[#DCCCAC]/50 border-r-[#DCCCAC]/50 text-amber-700',
  info: 'bg-[#FFF8EC] border-l-[#99AD7A] border-y-[#DCCCAC]/50 border-r-[#DCCCAC]/50 text-[#546B41]',
};

const ICON_STYLES = {
  success: 'text-[#546B41]',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-[#99AD7A]',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast = { ...toast, id };

    setToasts((prev) => {
      // Max 3 visible
      const updated = [...prev, newToast];
      return updated.length > 3 ? updated.slice(-3) : updated;
    });

    // Auto-dismiss
    const duration = toast.duration || 5000;
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 px-5 py-4 rounded-xl border-l-4 border-y border-r shadow-[0_8px_30px_rgba(84,107,65,0.12)] backdrop-blur-xl animate-slide-in relative overflow-hidden group ${STYLES[toast.type]}`}
              style={{
                animation: 'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              {/* Subtle background pattern */}
              <div className="absolute inset-0 opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
              
              <Icon size={20} className={`shrink-0 mt-0.5 relative z-10 ${ICON_STYLES[toast.type]}`} />
              <div className="flex-1 min-w-0 relative z-10">
                <p className="text-sm font-black uppercase tracking-wider">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs mt-1 font-medium opacity-80">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 opacity-40 hover:opacity-100 transition-opacity relative z-10 p-1 hover:bg-[#DCCCAC]/20 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%) scale(0.9);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
};
