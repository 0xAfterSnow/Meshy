import { NextRequest, NextResponse } from "next/server";
import { getMemories, getProject } from "@/lib/project-store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const memories = getMemories(projectId);

  // Sort by importance desc, strip embeddings from response (large)
  const sanitized = memories
    .map(({ embedding: _, ...m }) => m)
    .sort((a, b) => b.importance - a.importance);

  return NextResponse.json({ memories: sanitized, total: sanitized.length });
}
