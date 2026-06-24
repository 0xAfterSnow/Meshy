import { NextRequest, NextResponse } from "next/server";
import { getProject, getMemoryContext, processChatTurn } from "@/lib/project-store";

export async function POST(req: NextRequest) {
  try {
    const { projectId, message } = await req.json();

    if (!projectId || !message) {
      return NextResponse.json({ error: "Missing projectId or message" }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const memoryContext = getMemoryContext(projectId, message);

    const systemPrompt = `You are a coding assistant with persistent memory for the project "${project.name}".

${project.description ? `Project description: ${project.description}\n` : ""}
${memoryContext}

You remember everything important that has been discussed about this project across all sessions.
When answering, reference relevant memories naturally. If you learn something new and important, acknowledge that you'll remember it.
Keep responses focused and practical. Format code properly.`;

    // Supports both Anthropic and OpenRouter (or any OpenAI-compatible API)
    const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const useAnthropic = !!process.env.ANTHROPIC_API_KEY;

    if (!useOpenRouter && !useAnthropic) {
      return NextResponse.json(
        { error: "No API key found. Add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local" },
        { status: 500 }
      );
    }

    let assistantMessage = "";

    if (useOpenRouter) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://memorymesh.app",
          "X-Title": "MemoryMesh",
        },
        body: JSON.stringify({
          model: "gpt-oss-120b", // free tier model
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: 500 });
      }

      const data = await response.json();
      assistantMessage = data.choices?.[0]?.message?.content || "No response";

    } else {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: message }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return NextResponse.json({ error: `Anthropic error: ${err}` }, { status: 500 });
      }

      const data = await response.json();
      assistantMessage = data.content?.[0]?.text || "No response";
    }

    const { memoriesAdded, storageResult } = await processChatTurn(
      projectId,
      message,
      assistantMessage
    );

    return NextResponse.json({
      message: assistantMessage,
      memoriesAdded,
      storageResult,
      hadContext: memoryContext.length > 0,
    });
  } catch (err) {
    console.error("/api/chat error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
