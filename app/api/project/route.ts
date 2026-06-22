import { NextRequest, NextResponse } from "next/server";
import { getAllProjects, createProject, getProject, getChat, getStorageStatus } from "@/lib/project-store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("id");

  if (projectId) {
    const project = getProject(projectId);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const chat = getChat(projectId);
    const storage = getStorageStatus();
    return NextResponse.json({ project, chat, storage });
  }

  const projects = getAllProjects();
  const storage = getStorageStatus();
  return NextResponse.json({ projects, storage });
}

export async function POST(req: NextRequest) {
  const { name, description } = await req.json();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const project = createProject(name, description || "");
  return NextResponse.json({ project });
}
