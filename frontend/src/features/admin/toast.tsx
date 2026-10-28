"use client";

import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren, type ReactNode } from "react";

type ToastTone = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastCtx = {
  toast: (message: string, tone?: ToastTone) => void;
};

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="admin-toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`admin-toast admin-toast-${t.tone}`} role="status">
              <span>{t.message}</span>
              <button type="button" className="admin-toast-close" onClick={() => dismiss(t.id)} aria-label="Close">&times;</button>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
