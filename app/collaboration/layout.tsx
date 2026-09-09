import { PersonalWorkspaceShell } from "@/components/collaboration/personal-workspace-shell";

export default function CollaborationLayout({ children }: { children: React.ReactNode }) {
  return <PersonalWorkspaceShell>{children}</PersonalWorkspaceShell>;
}
