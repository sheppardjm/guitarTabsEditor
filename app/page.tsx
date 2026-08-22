import { listTabs } from "@/lib/library";
import LibraryBrowser from "@/components/LibraryBrowser";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const tabs = listTabs().map(({ content, ...meta }) => meta);
  return <LibraryBrowser tabs={tabs} />;
}
