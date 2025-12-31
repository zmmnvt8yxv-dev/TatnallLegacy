import { toast, type ToastOptions } from "react-toastify";

const shownToasts = new Set<string>();

export function notifyOnce(id: string, message: string, options?: ToastOptions) {
  if (shownToasts.has(id)) {
    return;
  }
  shownToasts.add(id);
  toast(message, { ...options, toastId: id });
}
