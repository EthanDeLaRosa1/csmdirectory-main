import React, { useState } from "react";
import { PRODUCTS_AND_MANAGERS, CS_SMES } from "@/data/directory";
import { UserCheck, ShieldCheck, Search, Users } from "lucide-react";

export const WhoToGoToView = () => {
  const [filter, setFilter] = useState("");

  const filteredProducts = PRODUCTS_AND_MANAGERS.filter(
    (p) =>
      p.feature.toLowerCase().includes(filter.toLowerCase()) ||
      p.productLine.toLowerCase().includes(filter.toLowerCase()) ||
      p.mainContact.toLowerCase().includes(filter.toLowerCase()) ||
      (p.additionalRemarks && p.additionalRemarks.toLowerCase().includes(filter.toLowerCase()))
  );

  const filteredSmes = CS_SMES.filter(
    (s) =>
      s.capability.toLowerCase().includes(filter.toLowerCase()) ||
      s.mainContact.toLowerCase().includes(filter.toLowerCase()) ||
      (s.additionalRemarks && s.additionalRemarks.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-foreground text-lg">Who To Go To For What</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Quick reference directory for Copado Product Line contacts, Product Managers, and Customer Success Subject Matter Experts.
        </p>
        <div className="flex items-center gap-2 bg-muted/40 p-2.5 rounded-xl border border-border mt-2">
          <Search className="w-4 h-4 text-muted-foreground ml-1" />
          <input
            type="text"
            placeholder="Search product contact, SME, feature, or capability..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Products & Product Managers Table */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-base">Products & Product Managers</h3>
          </div>
          <span className="text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full">
            {filteredProducts.length} Entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground uppercase font-semibold">
                <th className="py-2.5 px-3">Feature or Capability</th>
                <th className="py-2.5 px-3">Product Line</th>
                <th className="py-2.5 px-3">Main Product Contact</th>
                <th className="py-2.5 px-3">Additional Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground italic">
                    No matching product contacts found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground">{p.feature}</td>
                    <td className="py-2.5 px-3 text-muted-foreground font-mono">{p.productLine}</td>
                    <td className="py-2.5 px-3 text-primary font-bold font-mono">{p.mainContact}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{p.additionalRemarks || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Success SMEs Table */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold text-foreground text-base">Customer Success Subject Matter Experts (SMEs)</h3>
          </div>
          <span className="text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
            {filteredSmes.length} Entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground uppercase font-semibold">
                <th className="py-2.5 px-3">Capability / Topic</th>
                <th className="py-2.5 px-3">Main Contact</th>
                <th className="py-2.5 px-3">Additional Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredSmes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-muted-foreground italic">
                    No matching CS SMEs found.
                  </td>
                </tr>
              ) : (
                filteredSmes.map((s, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground">{s.capability}</td>
                    <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-bold font-mono">{s.mainContact}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{s.additionalRemarks || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};