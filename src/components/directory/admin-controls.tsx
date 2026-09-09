import { useEffect, useState } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/lib/admin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Header pill showing the current role and toggling admin mode. */
export function AdminToggle() {
  const { isAdmin, lock, setPromptOpen } = useAdmin();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => (isAdmin ? lock() : setPromptOpen(true))}
      className={
        isAdmin
          ? "border-success/40 bg-success-soft text-success hover:bg-success-soft"
          : "text-muted-foreground"
      }
      title={isAdmin ? "Admin mode active — click to lock" : "Read-only mode — click to unlock"}
    >
      {isAdmin ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
      <span className="hidden sm:inline">{isAdmin ? "Admin mode" : "Read-only"}</span>
    </Button>
  );
}

/** Global PIN prompt. Mount once inside AdminProvider. */
export function AdminPinDialog() {
  const { promptOpen, setPromptOpen, unlock, resolvePrompt } = useAdmin();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (promptOpen) {
      setPin("");
      setError(false);
    }
  }, [promptOpen]);

  const submit = () => {
    if (unlock(pin)) {
      toast.success("Admin mode unlocked");
      resolvePrompt();
    } else {
      setError(true);
    }
  };

  return (
    <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Admin PIN required
          </DialogTitle>
          <DialogDescription>
            Editing department details and verification status is restricted. Enter the 4-digit
            admin PIN to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="admin-pin">Admin PIN</Label>
          <Input
            id="admin-pin"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="••••"
            className={`font-mono tracking-[0.5em] ${error ? "border-destructive" : ""}`}
          />
          {error ? <p className="text-xs text-destructive">Incorrect PIN. Try again.</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setPromptOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            <LockOpen className="size-3.5" /> Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
