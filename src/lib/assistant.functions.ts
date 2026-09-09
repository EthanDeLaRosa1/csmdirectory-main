import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callGateway } from "./assistant.server";

export const askDirectory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ question: z.string().min(3).max(1000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return {
        deptId: null as string | null,
        answer: "The AI assistant is not configured. Use the keyword suggestions below instead.",
        steps: [] as string[],
      };
    }
    return await callGateway(data.question, apiKey);
  });
