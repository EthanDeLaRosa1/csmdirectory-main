import { AlertTriangle, PhoneCall, ShieldAlert, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function EmergencyBanner({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="bg-rose-600 text-white border-b border-rose-700 px-5 py-2.5 shadow-md">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/20 animate-pulse">
            <AlertTriangle className="size-4 text-white" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide uppercase">
                P1 Emergency Outage Mode Active
              </span>
              <Badge className="bg-white/20 text-white text-[10px] hover:bg-white/30 border-none">
                SLA: 15 Min Response
              </Badge>
            </div>
            <p className="text-[11px] text-rose-100">
              High-priority incident protocols engaged. Direct all active outage tickets through emergency hotlines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href="https://pagerduty.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 transition-colors"
          >
            <ShieldAlert className="size-3.5" /> PagerDuty On-Call <ExternalLink className="size-3" />
          </a>
          <a
            href="tel:+18005550199"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white text-rose-700 px-2.5 py-1 text-xs font-bold hover:bg-rose-50 transition-colors"
          >
            <PhoneCall className="size-3.5" /> P1 Hotline
          </a>
        </div>
      </div>
    </div>
  );
}