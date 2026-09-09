import { useState } from "react";
import { MessageSquareCode, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SlackIntakeModal({
  deptName,
  isOpen,
  onClose,
}: {
  deptName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [customer, setCustomer] = useState("");
  const [priority, setPriority] = useState("P2 - High Impact");
  const [summary, setSummary] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const slackSnippet = `🚨 *ESCALATION INTAKE: ${deptName.toUpperCase()}*
• *Customer:* ${customer || "[Customer Name]"}
• *Priority:* ${priority}
• *Salesforce / Support Ticket:* ${ticketUrl || "N/A"}
• *Issue Summary:* ${summary || "[Enter summary]"}
• *Requested SLA:* Immediate Routing`;

  const handleCopy = () => {
    navigator.clipboard.writeText(slackSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareCode className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Copy Escalation for Slack</h3>
              <p className="text-[11px] text-muted-foreground">Target: {deptName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold block mb-1">Customer Account</label>
            <Input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold block mb-1">Priority Tier</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="P1 - Critical Outage">P1 - Critical Outage</option>
                <option value="P2 - High Impact">P2 - High Impact</option>
                <option value="P3 - Standard Request">P3 - Standard Request</option>
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Ticket / Case Link</label>
              <Input
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                placeholder="https://..."
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">Brief Description</label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Explain blocker or escalation reason..."
              className="text-xs min-h-[60px]"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1 text-muted-foreground">Generated Slack Format</label>
            <pre className="rounded-lg bg-muted/60 p-3 text-[11px] font-mono whitespace-pre-wrap border border-border">
              {slackSnippet}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
          <Button size="sm" onClick={handleCopy} className="text-xs gap-1.5">
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            {copied ? "Copied to Clipboard!" : "Copy Snippet"}
          </Button>
        </div>
      </div>
    </div>
  );
}