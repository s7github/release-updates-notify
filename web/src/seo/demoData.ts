/** Sample releases for /demo. Invented text, labelled as sample on the page; names are generic. */
export interface DemoRelease {
  id: string;
  product: string;
  version: string;
  category: "Security" | "New feature" | "Bug fix" | "Major release";
  date: string;
  summary: string;
}

export const DEMO_RELEASES: readonly DemoRelease[] = [
  { id: "d1", product: "Sample Editor", version: "4.2.0", category: "New feature", date: "Today", summary: "Adds split panes and a command palette. Existing keybindings are unchanged." },
  { id: "d2", product: "Sample Database", version: "9.1.3", category: "Security", date: "Yesterday", summary: "Fixes a privilege escalation in role grants. Upgrade recommended for all users." },
  { id: "d3", product: "Sample Runtime", version: "22.0.0", category: "Major release", date: "3 days ago", summary: "New LTS line. Drops support for two end-of-life platforms and changes the default timeout." },
  { id: "d4", product: "Sample Design Tool", version: "118.4", category: "Bug fix", date: "5 days ago", summary: "Fixes export cropping on rotated frames and a crash when opening large files." },
];
