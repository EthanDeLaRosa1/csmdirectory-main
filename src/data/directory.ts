export type EscalationLevel = {
  level: string;
  who: string;
  when: string;
  cdr: string;
};

export type QuickLink = {
  name: string;
  description: string;
  url: string;
};

export type Department = {
  id: string;
  num: number;
  name: string;
  short: string;
  whatIs?: string;
  internalOnly?: boolean;
  owner: string;
  updated: string;
  criticalRule?: { title: string; body: string };
  triggersIntro?: string;
  triggers: string[];
  outOfScope: { need: string; goTo: string }[];
  intake: { title: string; note?: string; steps?: string[]; bullets?: string[] };
  contacts: { label: string; value: string }[];
  quickLinks: QuickLink[];
  escalation: EscalationLevel[];
  placeholders: string[];
  extras?: { title: string; items: string[] }[];
};

export const DOC_META = {
  targetDate: "August 15, 2026",
  lastUpdated: "August 11, 2026",
  owners: "Ethan DeLaRosa & Atravian",
};

export const GLOSSARY_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/18DdprZS0iZt475n_Zl1rq_zGuZRcqJS50gg77vQhGYc/edit";

export const SLA_MATRIX = [
  {
    priority: "P1 Critical",
    description: "Production down, all users affected, no workaround",
    success: "1 hour",
    successPlus: "<1 hour",
    signature: "<1 hour",
    coverage: "24/7 incl. weekends & holidays",
  },
  {
    priority: "P2 Urgent",
    description: "Major functionality issue, many users affected, no workaround",
    success: "2 hours",
    successPlus: "1 hour",
    signature: "1 hour",
    coverage: "24/7 incl. weekends & holidays",
  },
  {
    priority: "P3 High",
    description: "Performance issue, some users affected, workaround available",
    success: "4 hours",
    successPlus: "2 hours",
    signature: "2 hours",
    coverage: "Local business hours only",
  },
  {
    priority: "P4 Medium",
    description: "Routine technical issue, workaround available",
    success: "8 hours",
    successPlus: "4 hours",
    signature: "4 hours",
    coverage: "Local business hours only",
  },
];

export const CASE_STATUSES = [
  { status: "New", meaning: "Case submitted, awaiting pickup" },
  { status: "In Progress", meaning: "Support is actively investigating" },
  { status: "Awaiting Feedback", meaning: "Waiting on customer info (CDR should push customer)" },
  { status: "Escalated", meaning: "Escalated within Support or to another team" },
  { status: "On Hold", meaning: "Paused, waiting on a third party or fix" },
  { status: "Closed", meaning: "Issue resolved" },
];

export const DEPARTMENTS: Department[] = [
  {
    id: "customer-support",
    num: 1,
    name: "Customer Support",
    short: "Support",
    whatIs: "The reactive technical resolution team handling product break/fix issues and bug triage via case tickets.",
    owner: "Atravian",
    updated: "August 11, 2026",
    criticalRule: {
      title: "Support is almost always the first stop. Not the CSM, not Infrastructure, not PM.",
      body: "When a customer has a product issue, the answer is almost always: open a Support case first. Do not troubleshoot it yourself, do not route it to another team, and do not have the customer email someone directly. The case is the paper trail — everything else flows from it.",
    },
    triggersIntro:
      "Open a Support case when a customer has a product-related issue that needs investigation or resolution:",
    triggers: [
      "Product functionality issues and troubleshooting",
      "Installation or upgrade assistance",
      "Root Cause Analysis (RCA) requests for prior support interactions (P1 RCAs post to the Copado Status page automatically)",
      "Any backend investigation required before escalating to Infrastructure",
      "Persistent Jira synchronization or integration issues unresolved after implementation support",
    ],
    outOfScope: [
      { need: "Customizations built on top of Copado", goTo: "Customer's own development team" },
      {
        need: "DevOps Exchange listings from third parties or Copado Labs",
        goTo: "The listing owner directly",
      },
      {
        need: "Orgs running packages older than current or previous version",
        goTo: "Customer must upgrade first",
      },
      {
        need: "Issues older than 14 days (logs expired)",
        goTo: "Notify Support immediately if logs need retaining",
      },
      { need: "Maintenance window delays", goTo: "Check the Copado Status Page" },
      { need: "Salesforce-native errors", goTo: "Salesforce Support directly" },
      { need: "Best practice or how-to questions", goTo: "CSM / Success Team" },
    ],
    intake: {
      title: "Support has no single named POC — the channel IS the contact method.",
      bullets: [
        "Standard Copado Support: submit cases via the Copado Success Community",
        "Essentials Support: chat widget on the Essentials landing page",
        "CRT (Copado Robotic Testing): support widget in CRT org or email copadorobotictesting@copado.com",
      ],
      steps: [
        "Go to the Copado Success Community",
        "Submit a case with: Org ID, Detailed Description, Steps to Reproduce, and Promotion Branch Name",
        "Open a separate case for each unique issue",
        "Add collaborators if needed (max 5 per case)",
        "Scheduling a call: submit the case first, the agent provides a Calendly link — never invite Support to unagreed calls",
      ],
    },
    contacts: [
      { label: "Copado Success Community", value: "Primary case intake channel" },
      { label: "CRT Support Email", value: "copadorobotictesting@copado.com" },
      {
        label: "Support Call Scheduling",
        value: "Case first → agent sends Calendly link → never invite Support to unagreed calls",
      },
      { label: "Level 2 Support Lead", value: "[CONFIRM WITH MANAGER]" },
    ],
    quickLinks: [
      {
        name: "Copado Success Community (Case Submission)",
        description: "Primary portal for submitting and tracking all standard Copado Support cases.",
        url: "https://success.copado.com/",
      },
      {
        name: "Copado Status Page",
        description: "Live incident status, maintenance windows, and automatic P1 RCA postings.",
        url: "https://status.copado.com/",
      },
      {
        name: "Previous Copado Package Versions Report",
        description:
          "Salesforce report of historical package versions — use for version eligibility and upgrade planning. (Shared by Walt Ladner)",
        url: "https://copado.lightning.force.com/lightning/r/Report/00O5p000007ZgpvEAC/view?queryScope=userFolders",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Support Case Owner",
        when: "Case submitted and active",
        cdr: "Monitor case status",
      },
      {
        level: "Level 2",
        who: "Support Lead / Manager",
        when: "SLA missed, customer blocked, go-live at risk",
        cdr: "Escalate via case record or CSM",
      },
      {
        level: "Level 3",
        who: "VP of Support / Executive",
        when: "Unresolved P1, executive involved, contract risk",
        cdr: "Escalate through CSM manager alignment",
      },
    ],
    placeholders: [
      "Level 2 Support Lead contact name [CONFIRM]",
      "Account Super User lookup process [CONFIRM]",
    ],
  },
  {
    id: "tam",
    num: 2,
    name: "Technical Account Management (TAM)",
    short: "TAM",
    whatIs: "Proactive technical advisors who provide ongoing architecture guidance, pipeline design, and hands-on enablement.",
    owner: "Atravian",
    updated: "August 11, 2026",
    criticalRule: {
      title: "TAM access is contract-dependent. Not every customer has a TAM.",
      body: "Confirm their contract tier includes TAM engagement before making any referral. Pointing a customer to an inaccessible resource erodes trust.",
    },
    triggersIntro:
      "Engage TAM when a customer needs deep, ongoing technical advisory beyond standard CSM scope:",
    triggers: [
      "Complex architecture reviews or technical design sessions (branching strategy, pipeline design, org architecture)",
      "Deep technical enablement for customer internal teams",
      "Ongoing technical advisory across multiple sessions",
      "Hands-on technical guidance for building complex setups on Copado",
    ],
    outOfScope: [
      { need: "Standard product bug or broken functionality", goTo: "Customer Support" },
      { need: "Best practice or general how-to questions", goTo: "CSM / Success Team" },
      { need: "Contract or billing questions", goTo: "AE or Finance" },
      { need: "Custom build requiring a SOW", goTo: "Professional Services (PS)" },
    ],
    intake: {
      title: "TAM requests are CSM-facilitated.",
      steps: [
        "Confirm TAM contract tier entitlement",
        "Identify assigned TAM in CRM",
        "Document context, goals, and expected session count",
        "Contact TAM via team email / direct outreach",
      ],
    },
    contacts: [
      {
        label: "Primary TAM POC",
        value: "Francisco Garcia (Paco) — Sr. Director, TAM · fgarcia-velazquez@copado.com",
      },
      { label: "Backup TAM POC", value: "Nick Trujillo — Technical Account Manager" },
      { label: "Contact Method", value: "Direct email / CSM-mediated intro" },
      { label: "Contract tiers including TAM", value: "[CONFIRM WITH MANAGER]" },
    ],
    quickLinks: [
      {
        name: "TAM Primary POC Email",
        description: "Francisco Garcia (Paco), Sr. Director of TAM — direct email intake.",
        url: "mailto:fgarcia-velazquez@copado.com",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Nick Trujillo (TAM)",
        when: "Architecture review, deep enablement",
        cdr: "Facilitate request with context",
      },
      {
        level: "Level 2 / 3",
        who: "Francisco Garcia (Paco) — Sr. Director, TAM",
        when: "No SLA response, customer blocked on technical decision, or go-live risk",
        cdr: "Flag to CSM Manager & Paco",
      },
    ],
    placeholders: ["List of specific contract tiers that include TAM access [CONFIRM]"],
  },
  {
    id: "professional-services",
    num: 3,
    name: "Professional Services / Implementation",
    short: "Professional Services",
    whatIs: "Project-oriented implementation engineers who deliver scoped engagements and execute SOW-defined work.",
    owner: "Ethan DeLaRosa",
    updated: "August 11, 2026",
    criticalRule: {
      title: "No work begins until the SOW is signed.",
      body: "Do NOT set expectations with a customer that PS will help them until an SOW or contract is confirmed and signed. Intake is AE-led or CSM-led — never self-service.",
    },
    triggersIntro:
      "Engage PS when a customer's need goes beyond standard product configuration or CSM guidance:",
    triggers: [
      "Custom build requests requiring custom code or configuration outside standard product functionality",
      "Complex migrations such as org merges, large-scale metadata migrations, or environment restructuring",
      "New implementation scoping for a fresh customer needing structured onboarding and engineering support",
      "Statement of Work (SOW) required situations demanding a formal contract before work begins",
    ],
    outOfScope: [
      {
        need: "Product bug, installation issue, or troubleshooting",
        goTo: "Customer Support (Copado Success Community)",
      },
      { need: "Best practice guidance or product usage questions", goTo: "CSM / Success Team" },
      {
        need: "Architecture review or deep technical advisory",
        goTo: "TAM (if contract tier includes it)",
      },
      {
        need: "Anything not covered by an active SOW or contract",
        goTo: "Do not engage PS; loop in Sales / AE first to confirm commercial viability",
      },
    ],
    intake: {
      title: "Intake is AE-led or CSM-led via Salesforce Resource Request. NOT self-service.",
      steps: [
        "Identify the need — confirm the request falls within PS scope",
        "Loop in the AE to handle commercial alignment",
        "Submit a Resource Request in Salesforce (AE/CSM submits)",
        "PS scopes the work and produces a Statement of Work within the 3-day SLA",
        "Execute SOW — no work begins before the SOW is signed",
      ],
    },
    contacts: [
      { label: "AMER Primary POC", value: "Kristine Stateler" },
      { label: "AMER Backup POC", value: "Joe Imperato (Head of PS)" },
      { label: "EMEA Primary POC", value: "Christian Dormeyer" },
      { label: "EMEA Backup POC", value: "Joe Imperato (Head of PS)" },
      { label: "Intake Method", value: "Resource Request submission in Salesforce" },
      { label: "Scoping Turnaround SLA", value: "3 business days" },
    ],
    quickLinks: [
      {
        name: "Salesforce Resource Request (PS Intake)",
        description:
          "AE/CSM-submitted Resource Request in Salesforce that kicks off PS scoping and the 3-business-day SOW SLA.",
        url: "https://copado.lightning.force.com/",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Regional PS Lead (Kristine Stateler / Christian Dormeyer)",
        when: "Resource Request submitted; initial scoping in progress",
        cdr: "Facilitator; notify AE and PS Lead directly",
      },
      {
        level: "Level 2 / 3",
        who: "Joe Imperato (Head of PS)",
        when: "Request missed 3-day SLA, go-live date at risk, or SOW dispute",
        cdr: "Loop in AE; CSM documents business impact and escalates directly to Joe",
      },
    ],
    placeholders: [],
  },
  {
    id: "infrastructure",
    num: 4,
    name: "Infrastructure / Platform Engineering",
    short: "Infrastructure",
    whatIs: "Internal platform engineers responsible for backend infrastructure, log retention, and environment stability.",
    internalOnly: true,
    owner: "Ethan DeLaRosa",
    updated: "August 11, 2026",
    criticalRule: {
      title: "This team is NOT customer-facing.",
      body: "Customers and CDRs do NOT contact Infrastructure directly. There is no direct contact to share with customers. Route all requests through Support or CSM.",
    },
    triggersIntro:
      "Infrastructure involvement is needed when backend issues cannot be resolved at Support level:",
    triggers: [
      "Backend environment issues requiring backend access / intervention",
      "GovCloud environment requests",
      "Dedicated backend needs (isolated infrastructure)",
      "Log retention requests beyond 14 days (Copado default retention is 14 days — notify Support immediately)",
      "AI & IT Architecture exploration / custom tool scoping (building new internal tools or pairing AI solutions)",
    ],
    outOfScope: [
      { need: "Product bug or troubleshooting", goTo: "Customer Support" },
      { need: "Best practice questions", goTo: "CSM / Success Team" },
      { need: "Feature requests / roadmap", goTo: "Product Management" },
    ],
    intake: {
      title: "Two intake paths — both internal only.",
      bullets: [
        "Backend & Infrastructure escalations: primary internal Slack channel #copa-infra",
        "Route strictly through Customer Support case escalation or CSM — Support investigates first before pulling Infrastructure into #copa-infra",
        "Log retention (>14 days): notify Support immediately so they flag Infrastructure before the 14-day log purge",
        "AI & IT Architecture help: internal Slack channel #ai-and-it-architecture-help",
        "AI/Architecture intake: fill out the Project Intake Form directly in #ai-and-it-architecture-help (reference channel Cheat Sheet)",
      ],
    },
    contacts: [
      { label: "Primary Internal Slack Channel", value: "#copa-infra" },
      { label: "AI & IT Architecture Channel", value: "#ai-and-it-architecture-help" },
      { label: "AI & Architecture Lead", value: "Daniel O'Buck — Director of AI & IT Architecture" },
      { label: "Internal Ticketing / Jira Board", value: "[CONFIRM WITH MANAGER]" },
    ],
    quickLinks: [
      {
        name: "#copa-infra (Internal Slack)",
        description: "Internal-only backend and infrastructure escalation channel. Never share with customers.",
        url: "https://slack.com/app_redirect?channel=copa-infra",
      },
      {
        name: "#ai-and-it-architecture-help (Internal Slack)",
        description:
          "Project Intake Form, AI best practices, architecture and security guidance. Lead: Daniel O'Buck.",
        url: "https://slack.com/app_redirect?channel=ai-and-it-architecture-help",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Customer Support (Case Owner) / #copa-infra",
        when: "Issue open and active; backend investigation needed",
        cdr: "Monitor case status",
      },
      {
        level: "Level 2",
        who: "CSM escalation to Support / Infra lead",
        when: "No progress, customer blocked, go-live risk",
        cdr: "Flag internally with business impact",
      },
      {
        level: "Level 2 (AI / Architecture)",
        who: "Daniel O'Buck (Director of AI & IT Architecture)",
        when: "Project intake form submitted or AI architecture guidance needed",
        cdr: "Submit Project Intake Form in #ai-and-it-architecture-help",
      },
      {
        level: "Level 3",
        who: "VP of Support / Cross-functional Exec",
        when: "Executive involved, P1 down, contract risk",
        cdr: "Escalate via manager alignment",
      },
    ],
    placeholders: ["Internal ticketing process / Jira board details [CONFIRM]"],
    extras: [
      {
        title: "AI & IT Architecture — services provided",
        items: [
          "Brainstorming & planning: discussing ideas, guardrails, and project needs before writing code",
          "Architecture & security: guidance on data privacy, permissions, and guardrails",
          "AI best practices: pairing AI tools, creating master prompts, avoiding over-engineering",
        ],
      },
    ],
  },
  {
    id: "product-management",
    num: 5,
    name: "Product Management (PM)",
    short: "Product Management",
    whatIs: "Product strategists who prioritize features, manage the roadmap, and triage known issues for future releases.",
    owner: "Ethan DeLaRosa",
    updated: "August 10, 2026",
    criticalRule: {
      title: "PM is NOT a direct customer-facing team in most cases.",
      body: "Customers do not contact PM directly. All feature requests, roadmap inquiries, and Known Issue tracking go through the CSM first. Confirm with your manager whether CDRs can contact PM directly.",
    },
    triggersIntro:
      "Involve PM when a customer's need is about the product's future direction, a formal feature request, or tracking a known issue:",
    triggers: [
      "Formal feature requests — functionality that does not currently exist in the product",
      "Roadmap inquiries — what is coming, when, or whether a capability is planned",
      "Known Issue tracking and status updates — behavior already identified as a known issue",
    ],
    outOfScope: [
      {
        need: "Product bug or broken functionality",
        goTo: "Customer Support via Copado Success Community",
      },
      { need: "Best practice or how-to questions", goTo: "CSM / Success Team" },
      { need: "Custom build or development request", goTo: "Professional Services (PS)" },
      {
        need: "Architecture or technical design advisory",
        goTo: "TAM (if contract tier includes it)",
      },
    ],
    intake: {
      title: "All PM contact is CSM-mediated unless confirmed otherwise.",
      steps: [
        "Confirm it is a feature request, not a bug — if the product is not working as designed, open a Support case first",
        "Document the request clearly: what they want, why, and the business problem it solves",
        "Submit via designated contact — Agentia™ Advanced feature requests go to Anu Jethi",
        "Set realistic expectations: never promise a delivery date or guarantee it will be built",
        "Known Issues: check the Known Issues Board first, then share the entry/status with the customer",
      ],
    },
    contacts: [
      {
        label: "Known Issues Board (All Products)",
        value: "https://copado.lightning.force.com/lightning/r/Report/00OP7000003Jop0MAC/view",
      },
      { label: "Feature Requests Lead (Agentia™ Advanced)", value: "Anu Jethi" },
      { label: "Known Issues Lead (All Products)", value: "Kompal Paliwal (Head of CCE)" },
      { label: "Primary PM POC (General)", value: "[CONFIRM WITH PM TEAM]" },
      { label: "Feature Request Submission Form", value: "[WAITING ON ANU JETHI]" },
    ],
    quickLinks: [
      {
        name: "Copado Master Known Issues Report",
        description:
          "Check here before opening a case or contacting PM/CCE. Managed by Kompal Paliwal (Head of CCE).",
        url: "https://copado.lightning.force.com/lightning/r/Report/00OP7000003Jop0MAC/view",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "PM / CCE Product Area Lead",
        when: "Feature request submitted or Known Issue status query active",
        cdr: "CSM submits or follows up through designated PM channel",
      },
      {
        level: "Level 2",
        who: "PM Manager / CCE Leadership (Kompal Paliwal)",
        when: "No response within SLA, customer blocked by Known Issue with no workaround, or renewal risk",
        cdr: "CSM escalates via manager; loop in AE if commercial risk exists",
      },
      {
        level: "Level 3",
        who: "VP of Product",
        when: "Executive involved, core workflow blocked, major renewal risk",
        cdr: "Escalation via AE and CSM manager alignment",
      },
    ],
    placeholders: [
      "Feature Request form/link (waiting on Anu Jethi) [CONFIRM]",
      "Specific Level 2 escalation contact/channel once Rajit responds [CONFIRM]",
    ],
  },
  {
    id: "sales-ae",
    num: 6,
    name: "Sales / Account Executive (AE)",
    short: "Sales / AE",
    whatIs: "Commercial owners who manage contracts, renewals, and pricing conversations for customer accounts.",
    owner: "Ethan DeLaRosa",
    updated: "August 10, 2026",
    criticalRule: {
      title: "The AE owns the commercial relationship. The CSM owns the success relationship.",
      body: "Do not handle commercial conversations on behalf of the AE. Do not make pricing, contract, or expansion commitments. Your job is to identify the signal and hand it off cleanly and quickly.",
    },
    triggersIntro: "Loop in the AE whenever a conversation has commercial implications:",
    triggers: [
      "Contract renewals — any conversation about renewal dates, terms, or pricing",
      "Upsell or cross-sell conversations — adding seats, adding products, or expanding",
      "New product demos or evaluations for products the customer does not own",
      "Contract reduction / downsize intent (URGENT retention risk — notify the AE immediately)",
      "PS engagement initiation — the AE owns the commercial side of any Professional Services engagement",
    ],
    outOfScope: [
      {
        need: "Product bug or technical issue",
        goTo: "Customer Support via Copado Success Community",
      },
      { need: "Best practice or product usage questions", goTo: "CSM / Success Team" },
      {
        need: "Custom build or implementation request",
        goTo: "Professional Services (PS) — loop in AE first for commercial viability",
      },
      { need: "Invoice dispute or billing question", goTo: "Finance / Billing" },
      { need: "Contract amendment or DPA request", goTo: "Legal / Contracts (AE mediated)" },
    ],
    intake: {
      title: "There is no single AE POC — AE assignment varies by account.",
      bullets: [
        "Salesforce field: check the APO (Account Primary Owner) field on the account record",
        "Sales Ops / territory questions: post in #sales-ops (historically managed by Jess Tyler)",
      ],
      steps: [
        "Identify the signal — customer expresses interest in expansion or contract changes",
        "Acknowledge without committing — confirm receipt and connect them with their AE",
        "Notify the AE immediately via direct Slack message or email with name, context, and urgency",
        "Log the Opportunity in Salesforce following the Creating Opportunities Guide",
        "Coordinate, do not compete — the AE leads commercial terms; you stay aligned as CSM",
      ],
    },
    contacts: [
      { label: "AE lookup field", value: "APO (Account Primary Owner) on the Salesforce account" },
      { label: "Sales Ops / Territory Channel", value: "#sales-ops" },
      { label: "Sales Ops Historic Owner", value: "Jess Tyler" },
    ],
    quickLinks: [
      {
        name: "Creating Opportunities in Salesforce Guide",
        description:
          "Official step-by-step CRM guide for logging upsell/expansion opportunities during CSM-to-AE handoff.",
        url: "https://sites.google.com/copado.com/customersuccess/creating-opportunities",
      },
      {
        name: "#sales-ops (Internal Slack)",
        description: "Territory questions, unassigned accounts, and AE reassignment requests.",
        url: "https://slack.com/app_redirect?channel=sales-ops",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Assigned Account Executive (APO in Salesforce)",
        when: "Commercial signal identified, renewal approaching, upsell/downsell detected",
        cdr: "Identify and hand off cleanly; log in Salesforce",
      },
      {
        level: "Level 2",
        who: "AE Manager / Sales Director",
        when: "AE unresponsive, customer escalating commercially, renewal at risk",
        cdr: "Flag to CSM Manager and Sales Director",
      },
      {
        level: "Level 3",
        who: "VP of Sales",
        when: "Major contract/churn risk, executive involvement",
        cdr: "Escalate via CSM Manager alignment",
      },
    ],
    placeholders: [],
  },
  {
    id: "finance-billing",
    num: 7,
    name: "Finance / Billing",
    short: "Finance / Billing",
    whatIs: "Handles invoicing, payment disputes, credit adjustments, and billing-related inquiries.",
    owner: "Atravian",
    updated: "August 11, 2026",
    criticalRule: {
      title: "Finance conversations almost always need the AE involved.",
      body: "Loop in AE before routing directly to Finance, as billing disputes carry commercial implications.",
    },
    triggersIntro: "Involve Finance when requests concern money, invoices, or payments:",
    triggers: [
      "Invoice disputes (incorrect billing or rates)",
      "Credit adjustments",
      "Payment terms questions or schedule negotiation",
      "Billing discrepancies between contract and invoice",
    ],
    outOfScope: [
      { need: "Pricing, renewal terms, or expansion", goTo: "Sales / AE" },
      { need: "Contract language or amendments", goTo: "Legal / Contracts (via AE)" },
      { need: "Product issue affecting usage", goTo: "Customer Support" },
    ],
    intake: {
      title: "AE-mediated or CSM-mediated.",
      steps: [
        "Document customer discrepancy, invoice numbers, and supporting docs",
        "Loop in AE",
        "Submit to Finance via team email alias (finance@copado.com) with invoice and account context",
      ],
    },
    contacts: [
      { label: "Primary Alias", value: "finance@copado.com" },
      { label: "Backup / Escalation POC", value: "Craig Locke — Manager, OTC (Order to Cash)" },
      {
        label: "Intake Method",
        value: "Email submission to finance@copado.com with invoice and account context",
      },
      { label: "Turnaround SLA", value: "[CONFIRM SLA]" },
    ],
    quickLinks: [
      {
        name: "Finance Intake Alias",
        description: "Email finance@copado.com with invoice numbers, account context, and AE looped in.",
        url: "mailto:finance@copado.com",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Finance / Billing (finance@copado.com)",
        when: "Dispute, credit request, payment question",
        cdr: "Loop in AE; route to Finance",
      },
      {
        level: "Level 2",
        who: "Craig Locke (Manager, OTC) & AE Manager",
        when: "No SLA response, customer withholding payment",
        cdr: "Flag to CSM Manager, AE, and Craig Locke",
      },
      {
        level: "Level 3",
        who: "VP of Finance",
        when: "Executive involved, dispute threatening renewal",
        cdr: "Executive escalation via manager alignment",
      },
    ],
    placeholders: ["Turnaround SLA for billing requests [CONFIRM]"],
  },
  {
    id: "security-infosec",
    num: 8,
    name: "Security / InfoSec",
    short: "Security / InfoSec",
    whatIs: "Security and compliance team managing questionnaires, SOC 2/ISO documentation, and vulnerability disclosures.",
    owner: "Ethan DeLaRosa",
    updated: "August 11, 2026",
    criticalRule: {
      title: "Never post potential vulnerability details in public Slack channels.",
      body: "Direct customers reporting security vulnerabilities to security@copado.com. Do NOT email questionnaire spreadsheets directly to Security — open a security case using the internal field support guide.",
    },
    triggersIntro:
      "Involve Security when customers have security compliance, audit, or vulnerability concerns:",
    triggers: [
      "Security questionnaires required for enterprise procurement / compliance",
      "Penetration test results review or requests for executive security summaries",
      "Vulnerability disclosures reported by a customer or third-party security team",
      "Compliance documentation requests (SOC 2 reports, ISO 27001/42001 certs, HIPAA compliance, bridge letters, security policies)",
    ],
    outOfScope: [
      { need: "Standard user permission or login issues", goTo: "Customer Support" },
      { need: "Product feature bug troubleshooting", goTo: "Customer Support" },
      { need: "GovCloud architecture setup", goTo: "Infrastructure (via Support / CSM)" },
    ],
    intake: {
      title: "Trust Center first, then the internal security case process.",
      bullets: [
        "Self-service docs (SOC 2, ISO certs, bridge letters, policies): direct customers to the Copado Trust Center",
        "Questionnaires & pen tests: do NOT email spreadsheets to Security — follow the Security Field Support internal guide and open a case on the customer's behalf",
        "Set customer expectations based on the 5-business-day SLA",
        "Responsible disclosure: direct vulnerability reports to security@copado.com — never post details in public Slack",
      ],
    },
    contacts: [
      { label: "General Security Alias", value: "security@copado.com" },
      { label: "Copado Public Trust Center", value: "https://trust.copado.com" },
      {
        label: "Internal Security Case Creation Guide",
        value: "https://sites.google.com/copado.com/security/field-support#h.jag49odiugff",
      },
      { label: "Standard Questionnaire SLA", value: "5 business days" },
    ],
    quickLinks: [
      {
        name: "Copado Trust Center",
        description:
          "Public portal where customers self-serve SOC 2 reports, ISO certs, bridge letters, and security policies.",
        url: "https://trust.copado.com",
      },
      {
        name: "Security Field Support Internal Guide",
        description:
          "Internal instructions for opening a security case for questionnaires, pen tests, and custom requests.",
        url: "https://sites.google.com/copado.com/security/field-support#h.jag49odiugff",
      },
      {
        name: "Responsible Disclosure Email",
        description: "Route customer-reported vulnerabilities here immediately — never to public Slack.",
        url: "mailto:security@copado.com",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Security Case / security@copado.com",
        when: "Standard questionnaire submitted or security query received",
        cdr: "Open internal security case; communicate 5-day SLA",
      },
      {
        level: "Level 2 / 3 (Questionnaires)",
        who: "Oliver Kirkup / Meg LaVelle",
        when: "Questionnaire blocking a deal/renewal or missed 5-day SLA",
        cdr: "Flag to CSM Manager; loop in Oliver or Meg",
      },
      {
        level: "Level 2 / 3 (Incidents)",
        who: "Danny Fraginals (Head of Security)",
        when: "Active breach allegation, critical vulnerability report, or severe crisis",
        cdr: "Immediate escalation via Manager to Danny",
      },
    ],
    placeholders: [],
  },
  {
    id: "legal-contracts",
    num: 9,
    name: "Legal / Contracts",
    short: "Legal / Contracts",
    whatIs: "Legal counsel that reviews and executes DPAs, NDAs, contract amendments, and legal paperwork via AE intake.",
    owner: "Atravian",
    updated: "August 11, 2026",
    criticalRule: {
      title: "AE owns the Legal relationship; CDRs do NOT contact Legal directly.",
      body: "All Legal requests must go through the AE first. Direct inquiries will be redirected back.",
    },
    triggersIntro:
      "Involve Legal when requests require reviewing, executing, or modifying legal language:",
    triggers: [
      "Data Processing Agreement (DPA) requests (GDPR / data privacy)",
      "NDA execution before formal evaluations",
      "Contract amendments or addendums",
      "Reviewing customer legal paper / templates",
    ],
    outOfScope: [
      { need: "Pricing or renewal negotiation", goTo: "Sales / AE" },
      { need: "Security questionnaires / compliance docs", goTo: "Security / InfoSec" },
      { need: "Invoice or payment terms", goTo: "Finance / Billing (via AE)" },
    ],
    intake: {
      title: "AE-led process.",
      steps: [
        "Document customer request and deadline",
        "Notify AE immediately with document attachments",
        "Do NOT comment on legal substance or terms to the customer",
        "AE submits request to Legal via legal@copado.com",
      ],
    },
    contacts: [
      { label: "Primary Legal Alias", value: "legal@copado.com" },
      { label: "Backup / Escalation POC", value: "Stephen Oliver — RVP" },
      { label: "Process", value: "AE-mediated email submission" },
    ],
    quickLinks: [
      {
        name: "Legal Intake Alias",
        description: "AE-submitted legal requests (DPA, NDA, amendments) go to legal@copado.com.",
        url: "mailto:legal@copado.com",
      },
    ],
    escalation: [
      {
        level: "Level 1",
        who: "Account AE",
        when: "DPA, NDA, or amendment needed",
        cdr: "Hand off to AE with documentation",
      },
      {
        level: "Level 2 / 3",
        who: "Stephen Oliver (RVP) & Legal Team",
        when: "Missed SLA, compliance deadline at risk, or contract risk",
        cdr: "Flag to CSM Manager, AE, and Stephen Oliver",
      },
    ],
    placeholders: [],
  },
];

export const hasPlaceholder = (text: string) =>
  /\[CONFIRM[^\]]*\]|\[WAITING[^\]]*\]|\[YOUR NAME\]/i.test(text);