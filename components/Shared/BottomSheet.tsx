import React, { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className="relative bg-fin-card p-4 pt-2 rounded-t-3xl border-t border-fin-border shadow-2xl animate-in slide-in-from-bottom-full duration-300"
      >
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-fin-border mb-4" />
        {children}
      </div>
    </div>,
    document.body
  );
};

export default BottomSheet;
