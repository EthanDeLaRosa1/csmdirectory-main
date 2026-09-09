import { useEffect, useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Department } from "@/data/directory";
import { hasPlaceholder } from "@/data/directory";
import { useDirectoryStore, type DeptOverride } from "@/lib/directory-store";
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

export function EditDepartmentDialog({
  dept,
  open,
  onOpenChange,
  focusLabel,
}: {
  dept: Department;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusLabel?: string | null;
}) {
  const { saveDepartment, resetDepartment, reviewer } = useDirectoryStore();
  const [owner, setOwner] = useState(dept.owner);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);
  const [who, setWho] = useState(reviewer);

  useEffect(() => {
    if (!open) return;
    setOwner(dept.owner);
    setContacts(Object.fromEntries(dept.contacts.map((c) => [c.label, c.value])));
    setExtra([]);
    setWho(reviewer);
  }, [open, dept, reviewer]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit details — {dept.name}</DialogTitle>
          <DialogDescription>
            Update POC names, aliases, Slack channels, SLAs and intake links. Clearing every
            [CONFIRM] placeholder marks this department verified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="owner">Entry owner</Label>
            <div className="flex items-center gap-2">
              <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOwner("")}
                title="Clear entry owner"
                className="inline-flex items-center justify-center"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>

          {dept.contacts.map((c) => (
            <div key={c.label} className="space-y-1.5">
              <Label htmlFor={`c-${c.label}`} className="flex items-center gap-2">
                {c.label}
                {hasPlaceholder(contacts[c.label] ?? "") ? (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] text-warning-foreground">
                    pending
                  </span>
                ) : null}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`c-${c.label}`}
                  autoFocus={focusLabel === c.label}
                  value={contacts[c.label] ?? ""}
                  onChange={(e) => setContacts((s) => ({ ...s, [c.label]: e.target.value }))}
                  placeholder="e.g. jane.doe@copado.com or #ps-intake"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setContacts((s) => ({ ...s, [c.label]: "" }))}
                  title={`Clear ${c.label}`}
                  className="inline-flex items-center justify-center"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {extra.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr] items-center">
              <div className="flex items-center gap-2">
                <Input
                  value={row.label}
                  placeholder="Field (e.g. Slack channel)"
                  onChange={(e) =>
                    setExtra((s) => s.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtra((s) => s.filter((_, j) => j !== i))}
                  title={`Remove field ${i + 1}`}
                  className="inline-flex items-center justify-center"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <Input
                value={row.value}
                placeholder="Value (e.g. #csm-team)"
                onChange={(e) =>
                  setExtra((s) => s.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                }
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExtra((s) => [...s, { label: "", value: "" }])}
          >
            <Plus className="size-3.5" /> Add field
          </Button>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="who">Verified by</Label>
            <Input
              id="who"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Your name"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              resetDepartment(dept.id);
              onOpenChange(false);
              toast("Reverted to source data");
            }}
          >
            <RotateCcw className="size-3.5" /> Revert
          </Button>
          <Button
            type="button"
            onClick={() => {
              const payload: DeptOverride = {
                owner,
                contacts,
                extraContacts: extra.filter((r) => r.label.trim() && r.value.trim()),
              };
              saveDepartment(dept.id, payload, who);
              onOpenChange(false);
              toast.success("Details saved");
            }}
          >
            <Save className="size-3.5" /> Save details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
