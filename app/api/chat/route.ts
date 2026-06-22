import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
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

    // Get relevant memories for this message
    const memoryContext = getMemoryContext(projectId, message);

    // Build the system prompt with memory context
    const systemPrompt = `You are a coding assistant with persistent memory for the project "${project.name}".

${project.description ? `Project description: ${project.description}\n` : ""}
${memoryContext}

You remember everything important that has been discussed about this project across all sessions.
When answering, reference relevant memories naturally. If you learn something new and important, acknowledge that you'll remember it.
Keep responses focused and practical. Format code properly.`;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY. Add it to .env.local — see .env.example." },
        { status: 500 }
      );
    }

    // Call OpenAI API
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.badtheorylabs.com/v1" });
    const completion = await openai.chat.completions.create({
      model: "btl-2",
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    const assistantMessage = completion.choices[0]?.message?.content || "No response";

    // Process this turn: extract memories and sync to 0G
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
