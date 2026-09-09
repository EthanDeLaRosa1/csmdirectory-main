// Resolve the Claude/Anthropic API key from the existing Tango AI connection.
// Checks common secret names so whatever the project's Tango AI / Claude
// connection is stored as, it gets picked up without adding a new secret.

const KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "TANGO_AI_API_KEY",
  "TANGO_AI_KEY",
  "TANGO_API_KEY",
  "TANGOAI_API_KEY",
  "CLAUDE_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
];

export function getAnthropicKey(): string | null {
  for (const name of KEY_NAMES) {
    const v = Deno.env.get(name);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export const AI_KEY_NAMES = KEY_NAMES;
