import { useState } from "react";
import { Dashboard } from "@/components/paz/Dashboard";
import { Explore } from "@/components/paz/Explore";
import { AccountMapping } from "@/components/paz/AccountMapping";
import { CrossSourceReport } from "@/components/paz/CrossSourceReport";
import { Portfolio } from "@/components/paz/Portfolio";

export function PazPortalTab() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "explore" | "mapping" | "report" | "portfolio"
  >("explore");

  return (
    <div className="space-y-6">
      {/* PAZ Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">PAZ Intelligence Portal</h1>
          <p className="text-sm text-muted-foreground">Cross-source analytics, Gong transcripts, and Salesforce account mapping</p>
        </div>
      </div>

      {/* Internal PAZ Sub-Navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(["explore", "dashboard", "mapping", "report", "portfolio"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {tab === "mapping" ? "Account Mapping" : tab === "report" ? "Cross-Source Report" : tab}
          </button>
        ))}
      </div>

      {/* Active Tab View */}
      <div className="pt-2">
        {activeTab === "explore" && <Explore />}
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "mapping" && <AccountMapping />}
        {activeTab === "report" && <CrossSourceReport />}
        {activeTab === "portfolio" && <Portfolio />}
      </div>
    </div>
  );
}

export default PazPortalTab;
