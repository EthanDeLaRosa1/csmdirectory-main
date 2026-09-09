import { DEPARTMENTS } from "@/data/directory";

export function buildDirectoryIndex() {
  return DEPARTMENTS.map((d) =>
    [
      `## ${d.name} (id: ${d.id})${d.internalOnly ? " [NOT customer-facing]" : ""}`,
      d.criticalRule ? `Critical rule: ${d.criticalRule.title}` : "",
      `Use when: ${d.triggers.join("; ")}`,
      `Not this team: ${d.outOfScope.map((o) => `${o.need} -> ${o.goTo}`).join("; ")}`,
      `Intake: ${d.intake.title} ${(d.intake.steps ?? d.intake.bullets ?? []).join(" | ")}`,
      `Escalation: ${d.escalation.map((e) => `${e.level} ${e.who}`).join(" -> ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n\n");
}

export function assistantSystemPrompt() {
  return [
    "You are the routing assistant for Copado's internal CSM escalation directory.",
    "A CSM describes a situation and you decide which internal team owns it and what to do next.",
    "Only use the directory below. Never invent contacts, links, SLAs or people.",
    "Reply as compact JSON with keys: deptId (exact id from the directory, or null),",
    'answer (2-4 short sentences of guidance), steps (array of 2-4 imperative next steps).',
    "If the situation clearly starts with a Support case, say so explicitly.",
    "",
    buildDirectoryIndex(),
  ].join("\n");
}

export async function callGateway(question: string, apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: assistantSystemPrompt() },
        { role: "user", content: question },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "routing",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              deptId: { type: ["string", "null"] },
              answer: { type: "string" },
              steps: { type: "array", items: { type: "string" } },
            },
            required: ["deptId", "answer", "steps"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      res.status === 429
        ? "Rate limit reached — try again in a moment."
        : res.status === 402
          ? "AI credits exhausted for this workspace."
          : `Assistant unavailable (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content) as {
      deptId: string | null;
      answer: string;
      steps: string[];
    };
    return parsed;
  } catch {
    return { deptId: null, answer: content || "No answer returned.", steps: [] };
  }
}
