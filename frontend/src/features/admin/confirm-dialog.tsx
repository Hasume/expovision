"use client";

import { ConfirmSheet } from "./confirm-sheet";

type Props = {
  open: boolean;
  title: string;
  description?: string | undefined;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

/** Destructive / irreversible confirmations — bottom sheet, not a full-screen centered modal. */
export function ConfirmDialog(props: Props) {
  return <ConfirmSheet {...props} />;
}
