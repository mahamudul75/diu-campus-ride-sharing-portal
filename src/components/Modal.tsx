import React, { useEffect, useId, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';

const openModalStack: symbol[] = [];

export function useTopModalEscape(isOpen: boolean, onClose: () => void, preventClose = false): void {
  const modalIdRef = useRef<symbol>(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const id = modalIdRef.current;
    openModalStack.push(id);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose && openModalStack[openModalStack.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const idx = openModalStack.lastIndexOf(id);
      if (idx !== -1) {
        openModalStack.splice(idx, 1);
      }
    };
  }, [isOpen, preventClose]);
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  preventClose?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  preventClose = false
}) => {
  const titleId = useId();

  useTopModalEscape(isOpen, onClose, preventClose);

  if (!isOpen) return null;

  const maxWidthMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl'
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#222B42]/50 dark:bg-[#111827]/80 backdrop-blur-xs animate-fade-in"
      onClick={() => {
        if (!preventClose) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${maxWidthMap[maxWidth]} max-h-[90vh] flex flex-col bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl shadow-2xl border border-[#D4DAE7] dark:border-[#34445E] overflow-hidden transform transition-all animate-scale-up text-[#222B42] dark:text-[#F1F4FC]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D4DAE7] dark:border-[#34445E] bg-[#F0F2F8] dark:bg-[#151F32] shrink-0">
          <h3 id={titleId} className="font-bold text-[#222B42] dark:text-[#F1F4FC] text-base">{title}</h3>
          <button
            type="button"
            disabled={preventClose}
            onClick={() => {
              if (!preventClose) onClose();
            }}
            className="p-1 rounded-lg text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-[#F1F4FC] hover:bg-[#E1E6F0] dark:hover:bg-[#24334B] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
