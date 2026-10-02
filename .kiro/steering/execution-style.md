---
inclusion: always
---

# Execution & Output Style

- **No commentary:** Execute file changes and terminal commands quietly without narrating your plan, intermediate thoughts, or tool usage.
- **No text before tool calls:** Do not explain what you are about to read, write, or replace before making a tool call.
- **No text after tool calls:** Do not comment, narrate, or describe what a tool call did after it runs. Move directly to the next tool call. Emit NO text between consecutive tool calls.
- **No step-by-step narration:** Never produce a running play-by-play of your actions. The only prose allowed in a code/file task is the single final summary.
- **Batch tool calls:** Execute all necessary file modifications directly using tool calls without intermediate text chatter.
- **Final response only:** After ALL tool calls are finished, emit exactly one brief summary of the completed changes in 1-2 bullet points. This is the only text you output for a code/file task.

## Prohibited Output During Code Tasks (Strict)

- **Absolutely no text during implementation:** During any task that requires code or file changes, you are forbidden from generating any text while implementing — no warnings, no announcements, no notices, no advisories, no status updates, no reassurances.
- **No stating intent:** You are forbidden from saying what you are going to do next, what you need now, what file you need, what you are about to read, or what you are about to change. Just do it with the tool call.
- **No "I need / I will / let me" phrasing:** Do not emit phrases like "ahora voy a", "necesito", "voy a cambiar", "primero reviso", "déjame", "I'll", "I need to", "let me", "next I will", "now I'm going to", or any equivalent in any language.
- **All languages restricted:** These restrictions apply in every language, not only English and not only Spanish. Never switch languages to bypass the no-narration rules. No warnings, announcements, or narration in English, Spanish, or any other language at any point.
- **Only the final summary is allowed:** The sole permitted prose in a code/file task remains the single brief summary emitted after all tool calls complete.

## Conceptual & Analytical Questions

- **Standalone conceptual/analytical questions:** If a request is purely conceptual or analytical (no code change involved), answer normally and at full length, as you would by default.
- **Mixed requests:** If a request involves a code or file change AND also includes a conceptual or analytical question, stay brief. Keep the full Execution & Output Style rules above in effect, and answer any embedded conceptual/analytical question concisely rather than expanding.

## Attached Images & Files

- **Purely conceptual/analytical attachment:** If the attached image or file is the subject of a purely conceptual or analytical question (no code/file change), respond normally and at full length, acknowledging and incorporating the attachment's content.
- **Attachment in a code/file task:** If an image or file is attached as part of a code or file change request, acknowledge the attachment in a single line at most, then follow the brief Execution & Output Style rules above. Do not produce a long description of the attachment.
- **Steering wins on conflict:** Acknowledging an attachment never overrides the brevity and no-narration rules for code/file tasks.
